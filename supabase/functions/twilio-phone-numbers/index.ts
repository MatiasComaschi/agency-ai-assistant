import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import { validateUuid } from "../_shared/input-validator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid actions for input validation
const VALID_ACTIONS = ["search", "provision", "release", "list"] as const;

interface PhoneRequest {
  action: "search" | "provision" | "release" | "list";
  company_id?: string;
  area_code?: string;
  phone_number?: string;
  country?: string;
}

interface TwilioNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

// Twilio API helpers
const getTwilioAuth = () => {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }
  
  return {
    accountSid,
    authToken,
    authHeader: "Basic " + btoa(`${accountSid}:${authToken}`),
  };
};

// Search for available phone numbers
const searchAvailableNumbers = async (
  areaCode?: string,
  country = "US"
): Promise<TwilioNumber[]> => {
  const { accountSid, authHeader } = getTwilioAuth();
  
  let url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/${country}/Local.json?VoiceEnabled=true&SmsEnabled=true&PageSize=10`;
  
  if (areaCode) {
    url += `&AreaCode=${areaCode}`;
  }
  
  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("[twilio-phone] Search error:", error);
    throw new Error(`Twilio API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return (data.available_phone_numbers || []).map((num: Record<string, unknown>) => ({
    phoneNumber: num.phone_number as string,
    friendlyName: num.friendly_name as string,
    locality: num.locality as string || "",
    region: num.region as string || "",
    capabilities: {
      voice: (num.capabilities as Record<string, boolean>)?.voice ?? true,
      sms: (num.capabilities as Record<string, boolean>)?.sms ?? true,
      mms: (num.capabilities as Record<string, boolean>)?.mms ?? false,
    },
  }));
};

// Provision (purchase) a phone number
const provisionNumber = async (
  phoneNumber: string,
  companyId: string,
  webhookBaseUrl: string
): Promise<{ sid: string; phoneNumber: string }> => {
  const { accountSid, authHeader } = getTwilioAuth();
  
  const voiceUrl = `${webhookBaseUrl}/functions/v1/twilio-voice-inbound`;
  const smsUrl = `${webhookBaseUrl}/functions/v1/twilio-send-sms`;
  
  const params = new URLSearchParams();
  params.append("PhoneNumber", phoneNumber);
  params.append("FriendlyName", `Company ${companyId}`);
  params.append("VoiceUrl", voiceUrl);
  params.append("VoiceMethod", "POST");
  params.append("SmsUrl", smsUrl);
  params.append("SmsMethod", "POST");
  
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.error("[twilio-phone] Provision error:", error);
    throw new Error(`Failed to provision number: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    sid: data.sid,
    phoneNumber: data.phone_number,
  };
};

// Release (delete) a phone number
const releaseNumber = async (phoneNumber: string): Promise<void> => {
  const { accountSid, authHeader } = getTwilioAuth();
  
  // First, find the SID for this number
  const listResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
    { headers: { Authorization: authHeader } }
  );
  
  if (!listResponse.ok) {
    throw new Error("Failed to find phone number");
  }
  
  const listData = await listResponse.json();
  const numbers = listData.incoming_phone_numbers || [];
  
  if (numbers.length === 0) {
    throw new Error("Phone number not found in account");
  }
  
  const numberSid = numbers[0].sid;
  
  // Delete the number
  const deleteResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${numberSid}.json`,
    {
      method: "DELETE",
      headers: { Authorization: authHeader },
    }
  );
  
  if (!deleteResponse.ok && deleteResponse.status !== 204) {
    throw new Error("Failed to release phone number");
  }
};

// List all purchased numbers
const listPurchasedNumbers = async (): Promise<TwilioNumber[]> => {
  const { accountSid, authHeader } = getTwilioAuth();
  
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=100`,
    { headers: { Authorization: authHeader } }
  );
  
  if (!response.ok) {
    throw new Error("Failed to list phone numbers");
  }
  
  const data = await response.json();
  
  return (data.incoming_phone_numbers || []).map((num: Record<string, unknown>) => ({
    phoneNumber: num.phone_number as string,
    friendlyName: num.friendly_name as string,
    locality: "",
    region: "",
    capabilities: {
      voice: (num.capabilities as Record<string, boolean>)?.voice ?? true,
      sms: (num.capabilities as Record<string, boolean>)?.sms ?? true,
      mms: (num.capabilities as Record<string, boolean>)?.mms ?? false,
    },
  }));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is agency_admin
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "agency_admin")
      .single();

    if (!roles) {
      return new Response(
        JSON.stringify({ error: "Agency admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: PhoneRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, company_id, area_code, phone_number, country } = body;

    // Validate action
    if (!action || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
      return new Response(
        JSON.stringify({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[twilio-phone] Action: ${action}, Company: ${company_id || "N/A"}`);

    switch (action) {
      case "search": {
        const numbers = await searchAvailableNumbers(area_code, country || "US");
        return new Response(
          JSON.stringify({ success: true, numbers }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "provision": {
        if (!company_id || !validateUuid(company_id)) {
          return new Response(
            JSON.stringify({ error: "Valid company_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!phone_number) {
          return new Response(
            JSON.stringify({ error: "phone_number required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Provision the number with Twilio
        const result = await provisionNumber(phone_number, company_id, supabaseUrl);

        // Update the company's twilio_number
        const { error: updateError } = await supabaseAdmin
          .from("companies")
          .update({ twilio_number: result.phoneNumber })
          .eq("id", company_id);

        if (updateError) {
          console.error("[twilio-phone] DB update error:", updateError);
          // Try to release the number if we can't update the company
          try {
            await releaseNumber(result.phoneNumber);
          } catch (e) {
            console.error("[twilio-phone] Failed to rollback number:", e);
          }
          return new Response(
            JSON.stringify({ error: "Failed to update company with phone number" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Log to audits
        await supabaseAdmin.from("audits").insert({
          company_id,
          actor_user_id: user.id,
          entity_type: "phone_number",
          entity_id: company_id,
          action: "provisioned",
          metadata: { phone_number: result.phoneNumber },
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            phoneNumber: result.phoneNumber,
            message: `Phone number ${result.phoneNumber} provisioned successfully`
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "release": {
        if (!company_id || !validateUuid(company_id)) {
          return new Response(
            JSON.stringify({ error: "Valid company_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get company's current number
        const { data: company, error: companyError } = await supabaseAdmin
          .from("companies")
          .select("twilio_number")
          .eq("id", company_id)
          .single();

        if (companyError || !company?.twilio_number) {
          return new Response(
            JSON.stringify({ error: "Company has no phone number to release" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const releasedNumber = company.twilio_number;

        // Release from Twilio
        await releaseNumber(releasedNumber);

        // Clear the company's twilio_number
        await supabaseAdmin
          .from("companies")
          .update({ twilio_number: null })
          .eq("id", company_id);

        // Log to audits
        await supabaseAdmin.from("audits").insert({
          company_id,
          actor_user_id: user.id,
          entity_type: "phone_number",
          entity_id: company_id,
          action: "released",
          metadata: { phone_number: releasedNumber },
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Phone number ${releasedNumber} released successfully`
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list": {
        const numbers = await listPurchasedNumbers();
        return new Response(
          JSON.stringify({ success: true, numbers }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[twilio-phone] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
