import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// TwiML helper functions
const twimlResponse = (body: string): Response => {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    {
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    }
  );
};

// Audit logging helper
// deno-lint-ignore no-explicit-any
async function logAudit(
  supabase: any,
  companyId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const systemUserId = "00000000-0000-0000-0000-000000000000";
    await supabase.from("audits").insert({
      actor_user_id: systemUserId,
      company_id: companyId || "00000000-0000-0000-0000-000000000000",
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  } catch (err) {
    console.error("[twilio-voice-dial-complete] Audit log error:", err);
  }
}

// Update usage with call duration
async function updateCallUsage(
  supabaseUrl: string,
  companyId: string,
  callId: string,
  durationSeconds: number
): Promise<void> {
  try {
    console.log(`[twilio-voice-dial-complete] Updating usage: ${durationSeconds}s for call ${callId}`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/update-call-usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      },
      body: JSON.stringify({
        company_id: companyId,
        call_id: callId,
        duration_seconds: durationSeconds,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[twilio-voice-dial-complete] Usage update failed:", errorText);
    } else {
      const result = await response.json();
      console.log("[twilio-voice-dial-complete] Usage updated:", result);
    }
  } catch (err) {
    console.error("[twilio-voice-dial-complete] Error calling update-call-usage:", err);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parse URL params early to get call_id and company_id
  const url = new URL(req.url);
  const callId = url.searchParams.get("call_id") || "";
  const companyId = url.searchParams.get("company_id") || "";
  
  console.log("[twilio-voice-dial-complete] ====== DIAL COMPLETE ======");
  console.log("[twilio-voice-dial-complete] call_id:", callId);
  console.log("[twilio-voice-dial-complete] company_id:", companyId);
  console.log("[twilio-voice-dial-complete] call_id is missing:", callId === "MISSING_CALLSID" || !callId);

  try {
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
    } else {
      // Try to parse as form data anyway
      try {
        const text = await req.text();
        const urlParams = new URLSearchParams(text);
        for (const [key, value] of urlParams.entries()) {
          params[key] = value;
        }
      } catch {
        console.warn("[twilio-voice-dial-complete] Could not parse request body");
      }
    }

    console.log("[twilio-voice-dial-complete] Dial status callback params:", {
      dialCallStatus: params.DialCallStatus,
      dialCallDuration: params.DialCallDuration,
      recordingUrl: params.RecordingUrl,
      callSid: params.CallSid,
    });

    // Extract dial status info
    const dialStatus = params.DialCallStatus || "unknown"; // completed, busy, no-answer, failed, canceled
    const dialDuration = parseInt(params.DialCallDuration || "0", 10);
    const recordingUrl = params.RecordingUrl;
    const twilioCallSid = params.CallSid || "";

    // Always log to audits, even if call_id is missing
    await logAudit(supabase, companyId || null, "dial_complete", "twilio_webhook", callId || twilioCallSid, {
      call_id: callId,
      company_id: companyId,
      dial_status: dialStatus,
      dial_duration: dialDuration,
      recording_url: recordingUrl,
      twilio_call_sid: twilioCallSid,
      call_id_missing: callId === "MISSING_CALLSID" || !callId,
    });

    // Determine if callId is a valid database UUID or a Twilio CallSid
    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId);
    
    if (callId && isValidUuid) {
      console.log("[twilio-voice-dial-complete] Valid call log ID - updating database");
      
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

      // Update call log with final status and duration
      const { error: updateError } = await supabase
        .from("calls")
        .update({
          recording_url: recordingUrl || (existingJson.recording_url as string) || null,
          outcome,
          ended_at: new Date().toISOString(),
          duration_seconds: dialDuration,
          cost_cents: existingCost + callCostCents,
          extracted_json: {
            ...existingJson,
            dial_status: dialStatus,
            dial_duration: dialDuration,
            dial_completed_at: new Date().toISOString(),
          },
        })
        .eq("id", callId);

      if (updateError) {
        console.error("[twilio-voice-dial-complete] Error updating call log:", updateError);
      } else {
        console.log("[twilio-voice-dial-complete] Updated call log:", callId, "outcome:", outcome, "duration:", dialDuration);
      }

      // Update usage tracking with call duration (for minute-based billing)
      if (companyId && dialDuration > 0) {
        await updateCallUsage(supabaseUrl, companyId, callId, dialDuration);
      }

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
    } else if (callId === "MISSING_CALLSID" || !callId) {
      console.warn("[twilio-voice-dial-complete] call_id is MISSING_CALLSID or empty - cannot update call log");
      console.warn("[twilio-voice-dial-complete] This indicates the inbound webhook did not receive a CallSid from Twilio");
    } else {
      // callId is a Twilio CallSid (starts with CA), try to find the call by extracted_json
      console.log("[twilio-voice-dial-complete] call_id appears to be a Twilio CallSid, searching by extracted_json");
      
      const { data: callByCallSid } = await supabase
        .from("calls")
        .select("id, company_id")
        .eq("extracted_json->>call_sid", callId)
        .single();
      
      if (callByCallSid) {
        console.log("[twilio-voice-dial-complete] Found call by CallSid:", callByCallSid.id);
        // Update that call record
        await supabase.from("calls").update({
          outcome: dialStatus === "completed" ? "escalated_completed" : `escalated_${dialStatus}`,
          ended_at: new Date().toISOString(),
          duration_seconds: dialDuration,
        }).eq("id", callByCallSid.id);

        // Update usage tracking
        if (callByCallSid.company_id && dialDuration > 0) {
          await updateCallUsage(supabaseUrl, callByCallSid.company_id, callByCallSid.id, dialDuration);
        }
      } else {
        console.warn("[twilio-voice-dial-complete] Could not find call by CallSid:", callId);
      }
    }

    // Always return HTTP 200 quickly with valid TwiML
    console.log("[twilio-voice-dial-complete] ====== COMPLETE ======");
    return twimlResponse(`<Hangup />`);
    
  } catch (error) {
    console.error("[twilio-voice-dial-complete] ====== UNEXPECTED ERROR ======");
    console.error("[twilio-voice-dial-complete] Error:", error);
    
    // Log error to audits
    await logAudit(supabase, companyId || null, "dial_complete_error", "twilio_webhook", callId, {
      call_id: callId,
      company_id: companyId,
      error_message: error instanceof Error ? error.message : String(error),
    });
    
    // Always return HTTP 200 with valid TwiML (Twilio expects this)
    return twimlResponse(`<Hangup />`);
  }
});
