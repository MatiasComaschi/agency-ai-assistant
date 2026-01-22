import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SimulatorRequest {
  companyId: string;
  mode: "faq" | "booking" | "quote" | "complaint";
  callerName: string;
  callerPhone: string;
  userMessage: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyId, mode, callerName, callerPhone, userMessage, conversationHistory } = 
      await req.json() as SimulatorRequest;

    console.log("AI Simulator request:", { companyId, mode, callerName, callerPhone });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch company's AI profile
    const { data: aiProfile, error: profileError } = await supabase
      .from("ai_profiles")
      .select("*")
      .eq("company_id", companyId)
      .single();

    if (profileError) {
      console.error("Error fetching AI profile:", profileError);
    }

    // Fetch company's knowledge base items
    const { data: kbItems, error: kbError } = await supabase
      .from("knowledge_base_items")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (kbError) {
      console.error("Error fetching knowledge base:", kbError);
    }

    // Build knowledge base context
    const kbContext = kbItems?.map(item => {
      if (item.type === "faq" && item.question) {
        return `Q: ${item.question}\nA: ${item.answer}`;
      }
      return `${item.title}: ${item.answer}`;
    }).join("\n\n") || "No knowledge base items available.";

    // Get allowed actions from AI profile
    const allowedActions = aiProfile?.allowed_actions_json || {
      faq: true,
      booking: true,
      quote: false,
      reschedule: false,
      escalate: true
    };

    // Build system prompt
    const systemPrompt = `${aiProfile?.system_prompt || "You are a friendly and professional AI receptionist."}

${aiProfile?.disclosure_script || ""}

CALLER INFORMATION:
- Name: ${callerName || "Unknown"}
- Phone: ${callerPhone || "Unknown"}
- Intent Mode: ${mode.toUpperCase()}

ALLOWED ACTIONS:
${allowedActions.faq ? "- Answer FAQs from knowledge base" : "- FAQs: NOT ALLOWED"}
${allowedActions.booking ? "- Book appointments" : "- Booking: NOT ALLOWED"}
${allowedActions.quote ? "- Provide quotes" : "- Quotes: NOT ALLOWED"}
${allowedActions.reschedule ? "- Reschedule appointments" : "- Rescheduling: NOT ALLOWED"}
${allowedActions.escalate ? "- Escalate to human when needed" : "- Escalation: NOT ALLOWED"}

KNOWLEDGE BASE:
${kbContext}

CRITICAL GUARDRAILS:
1. If the request is OUT OF SCOPE or you have LOW CONFIDENCE in your answer:
   - Apologize briefly
   - Collect caller's name, phone, and reason for calling
   - Recommend escalation to a human
2. Stay within the bounds of the knowledge base and allowed actions.
3. Be conversational and natural, but professional.
4. For ${mode} mode, focus specifically on ${mode}-related requests.

RESPONSE FORMAT:
After your conversational response, you MUST include a JSON block with extracted information:
\`\`\`extracted_json
{
  "caller_name": "${callerName || ""}",
  "caller_phone": "${callerPhone || ""}",
  "service_requested": "",
  "preferred_time": "",
  "confidence": "high|medium|low",
  "needs_escalation": false,
  "escalation_reason": "",
  "intent_category": "${mode}"
}
\`\`\``;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build messages array
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage }
    ];

    console.log("Calling Lovable AI Gateway...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    console.log("AI Response received:", content.substring(0, 200));

    // Parse extracted_json from response
    let extractedJson = {
      caller_name: callerName || "",
      caller_phone: callerPhone || "",
      service_requested: "",
      preferred_time: "",
      confidence: "medium",
      needs_escalation: false,
      escalation_reason: "",
      intent_category: mode
    };

    const jsonMatch = content.match(/```extracted_json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        extractedJson = JSON.parse(jsonMatch[1].trim());
      } catch (e) {
        console.error("Failed to parse extracted JSON:", e);
      }
    }

    // Clean content (remove JSON block for display)
    const cleanContent = content.replace(/```extracted_json[\s\S]*?```/g, "").trim();

    return new Response(
      JSON.stringify({
        response: cleanContent,
        extracted_json: extractedJson,
        ai_profile_used: !!aiProfile,
        kb_items_count: kbItems?.length || 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AI Simulator error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
