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

    // Parse form data from Twilio (recording callback)
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

    console.log("[twilio-voice-voicemail] Recording callback:", {
      callId,
      companyId,
      recordingUrl: params.RecordingUrl,
      recordingDuration: params.RecordingDuration,
      transcriptionText: params.TranscriptionText,
    });

    // Extract recording info from Twilio callback
    const recordingUrl = params.RecordingUrl;
    const recordingDuration = parseInt(params.RecordingDuration || "0", 10);
    const transcriptionText = params.TranscriptionText;
    const recordingStatus = params.RecordingStatus;

    if (callId) {
      // Fetch existing call data
      const { data: existingCall } = await supabase
        .from("calls")
        .select("extracted_json, cost_cents")
        .eq("id", callId)
        .single();

      const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};

      // Calculate approximate cost (Twilio voicemail recording pricing varies)
      // Approximately $0.0025/minute for recording
      const recordingCostCents = Math.ceil((recordingDuration / 60) * 0.25);
      const existingCost = existingCall?.cost_cents || 0;

      // Update call log with recording info
      await supabase
        .from("calls")
        .update({
          recording_url: recordingUrl || null,
          transcript: transcriptionText || null,
          outcome: "voicemail",
          ended_at: new Date().toISOString(),
          cost_cents: existingCost + recordingCostCents,
          extracted_json: {
            ...existingJson,
            recording_duration: recordingDuration,
            recording_status: recordingStatus,
            voicemail_received_at: new Date().toISOString(),
          },
        })
        .eq("id", callId);

      console.log("[twilio-voice-voicemail] Updated call log with recording:", callId);

      // Create a follow-up task for the voicemail
      if (companyId) {
        await supabase.from("followup_tasks").insert({
          company_id: companyId,
          call_id: callId,
          title: "Review voicemail",
          status: "open",
          notes: transcriptionText
            ? `Voicemail transcription: ${transcriptionText.substring(0, 500)}`
            : `Voicemail received (${recordingDuration} seconds). Review recording.`,
        });

        console.log("[twilio-voice-voicemail] Created follow-up task for voicemail");
      }
    }

    // Return simple TwiML acknowledgment
    return twimlResponse(
      say("Thank you for your message. We will get back to you as soon as possible. Goodbye.") +
      `<Hangup />`
    );
  } catch (error) {
    console.error("[twilio-voice-voicemail] Unexpected error:", error);
    return twimlResponse(`<Hangup />`);
  }
});
