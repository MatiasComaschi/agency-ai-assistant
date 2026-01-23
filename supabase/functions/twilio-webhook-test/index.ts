import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { companyId, twilioNumber } = body;

    if (!companyId || !twilioNumber) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Missing companyId or twilioNumber",
          status: "error",
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("[twilio-webhook-test] Testing webhook for company:", companyId);
    console.log("[twilio-webhook-test] Twilio number:", twilioNumber);

    // Generate a realistic test CallSid
    const testCallSid = `CA_TEST_${Date.now().toString(16).toUpperCase()}`;
    
    // Build a realistic Twilio payload with proper CallSid
    const mockPayload = new URLSearchParams({
      CallSid: testCallSid,
      AccountSid: "ACtest123456789",
      From: "+16150001111",
      To: twilioNumber,
      Called: twilioNumber,
      Caller: "+16150001111",
      CallStatus: "ringing",
      Direction: "inbound",
      ApiVersion: "2010-04-01",
      _test: "true",
    });

    // Call twilio-voice-inbound server-to-server (no CORS issues)
    const inboundUrl = `${supabaseUrl}/functions/v1/twilio-voice-inbound`;
    
    console.log("[twilio-webhook-test] Calling:", inboundUrl);
    console.log("[twilio-webhook-test] Test CallSid:", testCallSid);
    
    const response = await fetch(inboundUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: mockPayload.toString(),
    });

    const twimlText = await response.text();
    const httpStatus = response.status;

    console.log("[twilio-webhook-test] Response status:", httpStatus);
    console.log("[twilio-webhook-test] TwiML response length:", twimlText.length);

    // Determine if it was successful
    const isValidTwiml = twimlText.includes("<Response>");
    const isCompanyMatched = !twimlText.includes("not configured") && 
                             !twimlText.includes("technical difficulties") &&
                             !twimlText.includes("cannot process");

    let resultStatus: "matched_company" | "no_match" | "error" = "error";
    if (isValidTwiml && isCompanyMatched) {
      resultStatus = "matched_company";
    } else if (isValidTwiml && !isCompanyMatched) {
      resultStatus = "no_match";
    }

    // Extract action URLs from the TwiML for display
    const actionUrlMatches = twimlText.match(/action="([^"]+)"/g) || [];
    const actionUrls = actionUrlMatches.map(m => m.replace('action="', '').replace('"', ''));
    
    // Extract call_id from action URLs if present
    let extractedCallId: string | null = null;
    for (const url of actionUrls) {
      const match = url.match(/call_id=([^&]+)/);
      if (match) {
        extractedCallId = decodeURIComponent(match[1]);
        break;
      }
    }

    return new Response(
      JSON.stringify({
        ok: resultStatus === "matched_company",
        status: resultStatus,
        httpStatus,
        twimlText,
        testCallSid,
        extractedCallId,
        actionUrls,
        error: resultStatus === "error" ? "Invalid response from webhook" : null,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("[twilio-webhook-test] Error:", error);
    
    return new Response(
      JSON.stringify({
        ok: false,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
