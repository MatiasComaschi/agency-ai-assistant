import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatCompanyHoursForAI } from "../_shared/format-hours.ts";
import { validateUuid } from "../_shared/input-validator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AIContextResponse {
  system_prompt: string;
  greeting_script: string;
  disclosure_script: string;
  after_hours_script: string;
  voice: string;
  language: string;
  disclosure_required: boolean;
  allowed_actions: Record<string, boolean>;
  escalation_rules: Record<string, unknown>;
  business_hours_text: string;
  knowledge_base: Array<{ type: string; title: string; question: string | null; answer: string }>;
  company_name: string;
  industry: string | null;
  timezone: string;
  services: Array<{ name: string; duration_minutes: number; price: number | null; description: string | null }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("company_id");

    // Validate company_id
    if (!companyId || !validateUuid(companyId)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing company_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[get-ai-context] Fetching context for company: ${companyId}`);

    // Fetch all required data in parallel
    const [
      platformSettingsResult,
      companyResult,
      aiProfileResult,
      companyHoursResult,
      knowledgeBaseResult,
      servicesResult,
    ] = await Promise.all([
      supabase.from("platform_settings").select("core_prompt, core_prompt_version").single(),
      supabase.from("companies").select("name, industry, timezone").eq("id", companyId).single(),
      supabase.from("ai_profiles").select("*").eq("company_id", companyId).single(),
      supabase.from("company_hours").select("day_of_week, open_time, close_time, is_closed").eq("company_id", companyId),
      supabase.from("knowledge_base_items").select("type, title, question, answer").eq("company_id", companyId).eq("is_active", true),
      supabase.from("services").select("name, duration_minutes, price, description").eq("company_id", companyId).eq("is_active", true),
    ]);

    // Check for company not found
    if (companyResult.error || !companyResult.data) {
      console.error(`[get-ai-context] Company not found: ${companyId}`);
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const company = companyResult.data;
    const platformSettings = platformSettingsResult.data;
    const aiProfile = aiProfileResult.data;
    const companyHours = companyHoursResult.data || [];
    const knowledgeBase = knowledgeBaseResult.data || [];
    const services = servicesResult.data || [];

    // Format business hours for AI context
    const businessHoursText = formatCompanyHoursForAI(companyHours, company.timezone);

    // Build knowledge base section for prompt
    const kbSection = knowledgeBase.length > 0
      ? `\n\nKNOWLEDGE BASE:\n${knowledgeBase.map((item) => {
          if (item.question) {
            return `Q: ${item.question}\nA: ${item.answer}`;
          }
          return `${item.title}: ${item.answer}`;
        }).join("\n\n")}`
      : "";

    // Build services section for prompt
    const servicesSection = services.length > 0
      ? `\n\nSERVICES OFFERED:\n${services.map((s) => {
          let line = `- ${s.name} (${s.duration_minutes} min)`;
          if (s.price !== null) line += ` - $${s.price}`;
          if (s.description) line += `: ${s.description}`;
          return line;
        }).join("\n")}`
      : "";

    // Build allowed actions section
    const allowedActions = (aiProfile?.allowed_actions_json as Record<string, boolean>) || {
      faq: true,
      booking: true,
      quote: false,
      reschedule: false,
      escalate: true,
    };
    
    const actionsSection = `\n\nALLOWED ACTIONS:\n${Object.entries(allowedActions)
      .map(([action, enabled]) => `- ${action}: ${enabled ? "YES" : "NO"}`)
      .join("\n")}`;

    // Assemble the complete system prompt
    const corePrompt = platformSettings?.core_prompt || "";
    const companyPrompt = aiProfile?.system_prompt || "";
    
    const fullSystemPrompt = [
      corePrompt,
      `\nYou are the AI receptionist for ${company.name}${company.industry ? ` (${company.industry})` : ""}.`,
      companyPrompt,
      businessHoursText,
      servicesSection,
      kbSection,
      actionsSection,
    ].filter(Boolean).join("\n");

    // Map voice_id to OpenAI voice names
    const voiceMap: Record<string, string> = {
      female: "alloy",
      male: "echo",
      alloy: "alloy",
      echo: "echo",
      fable: "fable",
      onyx: "onyx",
      nova: "nova",
      shimmer: "shimmer",
    };
    const voice = voiceMap[aiProfile?.voice_id || "female"] || "alloy";

    // Build the response
    const response: AIContextResponse = {
      system_prompt: fullSystemPrompt,
      greeting_script: aiProfile?.greeting_script || "Hello! Thank you for calling. How may I help you today?",
      disclosure_script: aiProfile?.disclosure_script || "Please note that you are speaking with an AI assistant.",
      after_hours_script: aiProfile?.after_hours_script || "We are currently closed. Please leave a message.",
      voice,
      language: aiProfile?.language || "en-US",
      disclosure_required: aiProfile?.disclosure_required ?? true,
      allowed_actions: allowedActions,
      escalation_rules: (aiProfile?.escalation_rules_json as Record<string, unknown>) || {
        escalateOnRequest: true,
        escalateOnComplaint: true,
        escalateAfterMinutes: 5,
      },
      business_hours_text: businessHoursText,
      knowledge_base: knowledgeBase.map((item) => ({
        type: item.type,
        title: item.title,
        question: item.question,
        answer: item.answer,
      })),
      company_name: company.name,
      industry: company.industry,
      timezone: company.timezone,
      services: services.map((s) => ({
        name: s.name,
        duration_minutes: s.duration_minutes,
        price: s.price,
        description: s.description,
      })),
    };

    console.log(`[get-ai-context] Successfully built context for ${company.name}`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[get-ai-context] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
