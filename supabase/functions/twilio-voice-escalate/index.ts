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

const dial = (number: string, options?: { 
  record?: boolean; 
  callerId?: string;
  timeout?: number;
  action?: string;
}): string => {
  const attrs: string[] = [];
  if (options?.record) {
    attrs.push('record="record-from-answer-dual"');
  }
  if (options?.callerId) {
    attrs.push(`callerId="${options.callerId}"`);
  }
  if (options?.timeout) {
    attrs.push(`timeout="${options.timeout}"`);
  }
  if (options?.action) {
    attrs.push(`action="${options.action}"`);
  }
  return `<Dial ${attrs.join(" ")}>${number}</Dial>`;
};

const escapeXml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse URL params
    const url = new URL(req.url);
    const callId = url.searchParams.get("call_id");
    const companyId = url.searchParams.get("company_id");
    const reason = url.searchParams.get("reason") || "caller_request";

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

    console.log("[twilio-voice-escalate] Escalation request:", {
      callId,
      companyId,
      reason,
      params: JSON.stringify(params),
    });

    if (!companyId) {
      console.error("[twilio-voice-escalate] Missing company_id");
      return twimlResponse(
        say("We're sorry, but we cannot process your request. Please try again later.")
      );
    }

    // Fetch company details
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, twilio_number, fallback_phone")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      console.error("[twilio-voice-escalate] Company not found:", companyId, companyError);
      return twimlResponse(
        say("We're sorry, but we cannot complete your transfer at this time.")
      );
    }

    // Check if fallback phone is configured
    if (!company.fallback_phone) {
      console.error("[twilio-voice-escalate] No fallback phone configured for company:", company.id);
      
      // Update call log if available
      if (callId) {
        await supabase
          .from("calls")
          .update({
            outcome: "escalation_failed",
            internal_notes: "No fallback phone number configured",
            ended_at: new Date().toISOString(),
          })
          .eq("id", callId);
      }

      return twimlResponse(
        say("We're sorry, but we are unable to transfer your call at this time. Please try calling back during business hours or leave a message.") +
        `<Hangup />`
      );
    }

    // Fetch Twilio integration config for recording setting
    const { data: integration } = await supabase
      .from("integrations")
      .select("config_json")
      .eq("company_id", company.id)
      .eq("provider", "twilio")
      .single();

    const config = (integration?.config_json as Record<string, unknown>) || {};
    const recordCalls = config.record_calls !== false;

    // Update call log with escalation info
    if (callId) {
      const { data: existingCall } = await supabase
        .from("calls")
        .select("extracted_json")
        .eq("id", callId)
        .single();

      const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};

      await supabase
        .from("calls")
        .update({
          outcome: "escalated",
          extracted_json: {
            ...existingJson,
            escalation_reason: reason,
            escalated_to: company.fallback_phone,
            escalated_at: new Date().toISOString(),
          },
        })
        .eq("id", callId);
    }

    console.log("[twilio-voice-escalate] Transferring to:", company.fallback_phone);

    // Build dial completion callback
    const baseUrl = supabaseUrl.replace("/rest/v1", "");
    const functionsBase = `${baseUrl}/functions/v1`;
    const dialCompleteAction = `${functionsBase}/twilio-voice-dial-complete?call_id=${callId}&company_id=${company.id}`;

    // Return TwiML to dial fallback phone
    return twimlResponse(
      say("Please hold while I transfer you to a team member.") +
      dial(company.fallback_phone, {
        record: recordCalls,
        callerId: company.twilio_number || undefined,
        timeout: 30,
        action: dialCompleteAction,
      }) +
      // Fallback if dial fails
      say("We were unable to reach a team member. Please try again later.") +
      `<Hangup />`
    );
  } catch (error) {
    console.error("[twilio-voice-escalate] Unexpected error:", error);
    return twimlResponse(
      say("We're sorry, but we encountered an error while transferring your call.") +
      `<Hangup />`
    );
  }
});
