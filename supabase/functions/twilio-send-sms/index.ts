import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendSmsRequest {
  company_id: string;
  to_phone: string;
  message: string;
  call_id?: string;
}

interface TwilioCredentials {
  account_sid: string;
  auth_token: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: SendSmsRequest = await req.json();
    const { company_id, to_phone, message, call_id } = body;

    console.log("[twilio-send-sms] Request received:", {
      company_id,
      to_phone: to_phone?.substring(0, 6) + "...",
      message_length: message?.length,
      call_id,
    });

    // Validate required fields
    if (!company_id || !to_phone || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: company_id, to_phone, message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate phone number format (E.164)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(to_phone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format. Use E.164 format (e.g., +14155551234)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch company details
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, twilio_number")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      console.error("[twilio-send-sms] Company not found:", companyError);
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!company.twilio_number) {
      console.error("[twilio-send-sms] Company has no Twilio number configured");
      return new Response(
        JSON.stringify({ error: "Company has no Twilio number configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Twilio credentials from integrations table
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("config_json, status")
      .eq("company_id", company_id)
      .eq("provider", "twilio")
      .single();

    if (integrationError || !integration) {
      console.error("[twilio-send-sms] Twilio integration not found:", integrationError);
      return new Response(
        JSON.stringify({ error: "Twilio integration not configured for this company" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (integration.status !== "connected") {
      return new Response(
        JSON.stringify({ error: "Twilio integration is not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = integration.config_json as Record<string, unknown>;
    const credentials: TwilioCredentials = {
      account_sid: config.account_sid as string,
      auth_token: config.auth_token as string,
    };

    if (!credentials.account_sid || !credentials.auth_token) {
      console.error("[twilio-send-sms] Missing Twilio credentials in config");
      return new Response(
        JSON.stringify({ error: "Twilio credentials not properly configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send SMS via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/Messages.json`;
    const authHeader = btoa(`${credentials.account_sid}:${credentials.auth_token}`);

    const formData = new URLSearchParams();
    formData.append("To", to_phone);
    formData.append("From", company.twilio_number);
    formData.append("Body", message);

    console.log("[twilio-send-sms] Sending SMS from:", company.twilio_number, "to:", to_phone.substring(0, 6) + "...");

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const twilioResult = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error("[twilio-send-sms] Twilio API error:", twilioResult);
      return new Response(
        JSON.stringify({ 
          error: "Failed to send SMS", 
          details: twilioResult.message || twilioResult.error_message 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[twilio-send-sms] SMS sent successfully:", twilioResult.sid);

    // If call_id provided, update the call record
    if (call_id) {
      const { data: existingCall } = await supabase
        .from("calls")
        .select("extracted_json")
        .eq("id", call_id)
        .single();

      const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};

      await supabase
        .from("calls")
        .update({
          extracted_json: {
            ...existingJson,
            booking_sms_sent: true,
            booking_sms_sent_at: new Date().toISOString(),
            booking_sms_to: to_phone,
            booking_sms_sid: twilioResult.sid,
          },
        })
        .eq("id", call_id);

      // Create follow-up task
      await supabase
        .from("followup_tasks")
        .insert({
          company_id,
          call_id,
          title: "Booking link sent",
          notes: `SMS sent to ${to_phone} with booking information`,
          status: "open",
        });

      console.log("[twilio-send-sms] Created follow-up task for booking");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_sid: twilioResult.sid,
        status: twilioResult.status 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[twilio-send-sms] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
