import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

// TwiML helper functions
const twimlResponse = (body: string): Response => {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    {
      headers: { "Content-Type": "application/xml" },
    }
  );
};

const say = (text: string, voice = "Polly.Joanna"): string => {
  return `<Say voice="${voice}">${escapeXml(text)}</Say>`;
};

const gather = (options: {
  action: string;
  input?: string;
  timeout?: number;
  speechTimeout?: string;
  hints?: string;
  innerTwiml?: string;
}): string => {
  const attrs = [
    `action="${options.action}"`,
    `input="${options.input || "speech"}"`,
    `timeout="${options.timeout || 3}"`,
    `speechTimeout="${options.speechTimeout || "auto"}"`,
  ];
  if (options.hints) {
    attrs.push(`hints="${options.hints}"`);
  }
  return `<Gather ${attrs.join(" ")}>${options.innerTwiml || ""}</Gather>`;
};

const escapeXml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

// Escalation triggers
const ESCALATION_KEYWORDS = [
  "speak to someone",
  "talk to a person",
  "human",
  "representative",
  "manager",
  "supervisor",
  "transfer",
  "real person",
  "operator",
  "agent",
];

const COMPLAINT_KEYWORDS = [
  "complaint",
  "complain",
  "angry",
  "frustrated",
  "unacceptable",
  "terrible",
  "awful",
  "horrible",
  "ridiculous",
  "sue",
  "lawyer",
  "attorney",
];

const shouldEscalate = (
  speechResult: string,
  escalationRules: Record<string, unknown>
): { escalate: boolean; reason: string } => {
  const lowerSpeech = speechResult.toLowerCase();

  // Check for explicit escalation request
  if (escalationRules.escalateOnRequest !== false) {
    for (const keyword of ESCALATION_KEYWORDS) {
      if (lowerSpeech.includes(keyword)) {
        return { escalate: true, reason: "caller_request" };
      }
    }
  }

  // Check for complaint language
  if (escalationRules.escalateOnComplaint !== false) {
    for (const keyword of COMPLAINT_KEYWORDS) {
      if (lowerSpeech.includes(keyword)) {
        return { escalate: true, reason: "complaint_detected" };
      }
    }
  }

  return { escalate: false, reason: "" };
};

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse URL params
    const url = new URL(req.url);
    const callId = url.searchParams.get("call_id");
    const companyId = url.searchParams.get("company_id");
    const turnCount = parseInt(url.searchParams.get("turn") || "1", 10);

    // Parse form data from Twilio
    const contentType = req.headers.get("content-type") || "";
    let params: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        params[key] = value.toString();
      }
    } else if (contentType.includes("application/json")) {
      params = await req.json();
    }

    const speechResult = params.SpeechResult || "";
    const confidence = parseFloat(params.Confidence || "0");

    console.log("[twilio-voice-conversation] Processing speech:", {
      callId,
      companyId,
      turnCount,
      speechResult: speechResult.substring(0, 100),
      confidence,
    });

    if (!companyId) {
      console.error("[twilio-voice-conversation] Missing company_id");
      return twimlResponse(
        say("We're sorry, but we cannot process your request. Goodbye.") +
        `<Hangup />`
      );
    }

    // Build base URLs
    const baseUrl = supabaseUrl.replace("/rest/v1", "");
    const functionsBase = `${baseUrl}/functions/v1`;
    const escalateUrl = `${functionsBase}/twilio-voice-escalate?call_id=${callId}&company_id=${companyId}`;
    const nextTurnUrl = `${functionsBase}/twilio-voice-conversation?call_id=${callId}&company_id=${companyId}&turn=${turnCount + 1}`;

    // Fetch company and AI profile
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, fallback_phone")
      .eq("id", companyId)
      .single();

    const { data: aiProfile } = await supabase
      .from("ai_profiles")
      .select("*")
      .eq("company_id", companyId)
      .single();

    const escalationRules = (aiProfile?.escalation_rules_json as Record<string, unknown>) || {
      escalateOnRequest: true,
      escalateOnComplaint: true,
      escalateAfterMinutes: 5,
    };

    // Check for escalation triggers
    if (speechResult) {
      const escalationCheck = shouldEscalate(speechResult, escalationRules);
      if (escalationCheck.escalate) {
        console.log("[twilio-voice-conversation] Escalating:", escalationCheck.reason);

        // Update call log
        if (callId) {
          const { data: existingCall } = await supabase
            .from("calls")
            .select("extracted_json, transcript")
            .eq("id", callId)
            .single();

          const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
          const existingTranscript = existingCall?.transcript || "";

          await supabase
            .from("calls")
            .update({
              transcript: existingTranscript + `\nCaller: ${speechResult}`,
              extracted_json: {
                ...existingJson,
                escalation_trigger: escalationCheck.reason,
              },
            })
            .eq("id", callId);
        }

        return twimlResponse(
          say("I understand. Let me transfer you to a team member who can better assist you.") +
          `<Redirect>${escalateUrl}&amp;reason=${escalationCheck.reason}</Redirect>`
        );
      }
    }

    // Check if max turns reached
    const maxTurns = (escalationRules.escalateAfterMinutes as number) || 5;
    if (turnCount >= maxTurns) {
      console.log("[twilio-voice-conversation] Max turns reached, offering escalation");
      return twimlResponse(
        gather({
          action: `${functionsBase}/twilio-voice-conversation?call_id=${callId}&company_id=${companyId}&turn=${turnCount + 1}&offer_escalation=true`,
          input: "speech",
          timeout: 3,
          speechTimeout: "auto",
          innerTwiml: say("I want to make sure I'm helping you properly. Would you like me to transfer you to a team member, or is there something else I can help you with?"),
        }) +
        `<Redirect>${escalateUrl}&amp;reason=max_turns</Redirect>`
      );
    }

    // Call AI to generate response
    let aiResponse = "I'm sorry, I didn't quite catch that. Could you please repeat your question?";

    if (speechResult && lovableApiKey) {
      try {
        // Fetch knowledge base
        const { data: kbItems } = await supabase
          .from("knowledge_base_items")
          .select("*")
          .eq("company_id", companyId)
          .eq("is_active", true);

        // Build context
        const kbContext = kbItems
          ?.map((item) => `Q: ${item.question || item.title}\nA: ${item.answer}`)
          .join("\n\n") || "";

        const systemPrompt = `You are a helpful AI phone receptionist for ${company?.name || "the company"}.

${aiProfile?.system_prompt || "You are friendly and professional."}

Tone: ${aiProfile?.tone || "professional"}

IMPORTANT RULES:
1. Keep responses brief and conversational (1-3 sentences max)
2. If you cannot help with something, apologize and offer to transfer to a team member
3. Never make up information - only use the knowledge base provided
4. Be empathetic and patient

Knowledge Base:
${kbContext || "No specific information available."}

Respond to the caller's question naturally and briefly.`;

        const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: speechResult },
            ],
            max_tokens: 150,
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          aiResponse = data.choices?.[0]?.message?.content || aiResponse;
          
          // Clean up response for TTS
          aiResponse = aiResponse
            .replace(/\*\*/g, "")
            .replace(/\*/g, "")
            .replace(/```[\s\S]*?```/g, "")
            .trim();
        }
      } catch (aiError) {
        console.error("[twilio-voice-conversation] AI error:", aiError);
      }
    }

    // Update call transcript
    if (callId) {
      const { data: existingCall } = await supabase
        .from("calls")
        .select("transcript")
        .eq("id", callId)
        .single();

      const existingTranscript = existingCall?.transcript || "";
      const newTranscript = speechResult
        ? `${existingTranscript}\nCaller: ${speechResult}\nAI: ${aiResponse}`
        : existingTranscript;

      await supabase
        .from("calls")
        .update({ transcript: newTranscript.trim() })
        .eq("id", callId);
    }

    console.log("[twilio-voice-conversation] AI response:", aiResponse.substring(0, 100));

    // Continue conversation
    return twimlResponse(
      gather({
        action: nextTurnUrl,
        input: "speech",
        timeout: 5,
        speechTimeout: "auto",
        hints: "yes, no, booking, appointment, schedule, quote, question, help, speak to someone, transfer, thank you, goodbye",
        innerTwiml: say(aiResponse),
      }) +
      // If no response, prompt again or end
      say("Are you still there? If you have any other questions, please let me know. Otherwise, thank you for calling. Goodbye.") +
      `<Hangup />`
    );
  } catch (error) {
    console.error("[twilio-voice-conversation] Unexpected error:", error);
    return twimlResponse(
      say("We're sorry, but we encountered an error. Please try calling back later.") +
      `<Hangup />`
    );
  }
});
