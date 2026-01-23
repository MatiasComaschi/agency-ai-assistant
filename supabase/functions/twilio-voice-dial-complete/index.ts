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

    // Parse form data from Twilio (dial status callback)
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

    console.log("[twilio-voice-dial-complete] Dial status callback:", {
      callId,
      companyId,
      dialCallStatus: params.DialCallStatus,
      dialCallDuration: params.DialCallDuration,
      recordingUrl: params.RecordingUrl,
    });

    // Extract dial status info
    const dialStatus = params.DialCallStatus; // completed, busy, no-answer, failed, canceled
    const dialDuration = parseInt(params.DialCallDuration || "0", 10);
    const recordingUrl = params.RecordingUrl;

    if (callId) {
      // Fetch existing call data
      const { data: existingCall } = await supabase
        .from("calls")
        .select("extracted_json, cost_cents, started_at")
        .eq("id", callId)
        .single();

      const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
      const existingCost = existingCall?.cost_cents || 0;

      // Calculate call duration cost (approximate Twilio pricing)
      // Approximately $0.013/minute for outbound calls
      const callCostCents = Math.ceil((dialDuration / 60) * 1.3);

      // Determine final outcome based on dial status
      let outcome = "escalated";
      if (dialStatus === "completed") {
        outcome = "escalated_completed";
      } else if (dialStatus === "busy") {
        outcome = "escalated_busy";
      } else if (dialStatus === "no-answer") {
        outcome = "escalated_no_answer";
      } else if (dialStatus === "failed" || dialStatus === "canceled") {
        outcome = "escalated_failed";
      }

      // Update call log with final status
      await supabase
        .from("calls")
        .update({
          recording_url: recordingUrl || existingCall?.extracted_json ? (existingJson.recording_url as string) : null,
          outcome,
          ended_at: new Date().toISOString(),
          cost_cents: existingCost + callCostCents,
          extracted_json: {
            ...existingJson,
            dial_status: dialStatus,
            dial_duration: dialDuration,
            dial_completed_at: new Date().toISOString(),
          },
        })
        .eq("id", callId);

      console.log("[twilio-voice-dial-complete] Updated call log:", callId, "outcome:", outcome);

      // Create follow-up task if call was not completed
      if (companyId && dialStatus !== "completed") {
        await supabase.from("followup_tasks").insert({
          company_id: companyId,
          call_id: callId,
          title: `Follow up on missed escalation (${dialStatus})`,
          status: "open",
          notes: `Caller was transferred but the call was ${dialStatus}. Please follow up.`,
        });

        console.log("[twilio-voice-dial-complete] Created follow-up task for missed escalation");
      }
    }

    // Return empty TwiML (call is ending)
    return twimlResponse(`<Hangup />`);
  } catch (error) {
    console.error("[twilio-voice-dial-complete] Unexpected error:", error);
    return twimlResponse(`<Hangup />`);
  }
});
