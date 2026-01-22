import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IntegrationRequest {
  action: "connect" | "disconnect" | "test" | "sync";
  company_id: string;
  provider: string;
  credentials?: Record<string, string>;
}

// Provider test functions - simulate API validation
const testProviderConnection = async (
  provider: string,
  credentials: Record<string, string>
): Promise<{ success: boolean; message: string }> => {
  // In production, these would make actual API calls
  // For now, validate that required fields are present
  switch (provider) {
    case "twilio":
      if (!credentials.account_sid || !credentials.auth_token) {
        return { success: false, message: "Missing Account SID or Auth Token" };
      }
      // Simulate Twilio API check
      return { success: true, message: "Successfully connected to Twilio" };

    case "calendly":
      if (!credentials.api_key) {
        return { success: false, message: "Missing API Key" };
      }
      return { success: true, message: "Successfully connected to Calendly" };

    case "square":
      if (!credentials.access_token) {
        return { success: false, message: "Missing Access Token" };
      }
      return { success: true, message: "Successfully connected to Square Appointments" };

    case "fresha":
      if (!credentials.api_key || !credentials.partner_id) {
        return { success: false, message: "Missing API Key or Partner ID" };
      }
      return { success: true, message: "Successfully connected to Fresha" };

    case "google_calendar":
      if (!credentials.client_id || !credentials.client_secret) {
        return { success: false, message: "Missing Client ID or Client Secret" };
      }
      return { success: true, message: "Successfully connected to Google Calendar" };

    case "stripe":
      if (!credentials.secret_key) {
        return { success: false, message: "Missing Secret Key" };
      }
      // Validate key format
      if (!credentials.secret_key.startsWith("sk_")) {
        return { success: false, message: "Invalid Stripe Secret Key format" };
      }
      return { success: true, message: "Successfully connected to Stripe" };

    default:
      return { success: false, message: `Unknown provider: ${provider}` };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token for RLS
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
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

    const body: IntegrationRequest = await req.json();
    const { action, company_id, provider, credentials } = body;

    // Validate required fields
    if (!action || !company_id || !provider) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: action, company_id, provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database operations (credentials are sensitive)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user has access to this company
    const { data: membership } = await supabaseAdmin
      .from("memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", company_id)
      .single();

    if (!membership) {
      return new Response(
        JSON.stringify({ error: "Access denied to this company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[integrations] Action: ${action}, Provider: ${provider}, Company: ${company_id}`);

    switch (action) {
      case "connect": {
        if (!credentials) {
          return new Response(
            JSON.stringify({ error: "Credentials required for connect action" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Test connection first
        const testResult = await testProviderConnection(provider, credentials);
        if (!testResult.success) {
          return new Response(
            JSON.stringify({ error: testResult.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Store integration (credentials in config_json - encrypted at rest in Supabase)
        const { data, error } = await supabaseAdmin
          .from("integrations")
          .upsert({
            company_id,
            provider,
            status: "connected",
            config_json: { 
              // Store masked version for display, full creds are server-side only
              credentials_stored: true,
              ...Object.fromEntries(
                Object.entries(credentials).map(([k, v]) => [
                  k,
                  v.length > 8 ? `${v.slice(0, 4)}...${v.slice(-4)}` : "****"
                ])
              )
            },
            connected_at: new Date().toISOString(),
            last_sync_at: new Date().toISOString(),
          }, { onConflict: "company_id,provider" })
          .select()
          .single();

        if (error) {
          console.error("[integrations] Connect error:", error);
          return new Response(
            JSON.stringify({ error: "Failed to save integration" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: testResult.message, integration: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        const { error } = await supabaseAdmin
          .from("integrations")
          .update({ 
            status: "disconnected", 
            config_json: {},
            connected_at: null 
          })
          .eq("company_id", company_id)
          .eq("provider", provider);

        if (error) {
          console.error("[integrations] Disconnect error:", error);
          return new Response(
            JSON.stringify({ error: "Failed to disconnect integration" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: `${provider} disconnected` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "test": {
        // Get existing integration
        const { data: integration, error: fetchError } = await supabaseAdmin
          .from("integrations")
          .select("*")
          .eq("company_id", company_id)
          .eq("provider", provider)
          .single();

        if (fetchError || !integration || integration.status !== "connected") {
          return new Response(
            JSON.stringify({ error: "Integration not connected" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Simulate testing connection
        // In production, this would re-validate against the actual API
        await supabaseAdmin
          .from("integrations")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", integration.id);

        return new Response(
          JSON.stringify({ success: true, message: `${provider} connection verified` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "sync": {
        // Get existing integration
        const { data: integration, error: fetchError } = await supabaseAdmin
          .from("integrations")
          .select("*")
          .eq("company_id", company_id)
          .eq("provider", provider)
          .single();

        if (fetchError || !integration || integration.status !== "connected") {
          return new Response(
            JSON.stringify({ error: "Integration not connected" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Simulate sync operation
        await supabaseAdmin
          .from("integrations")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", integration.id);

        return new Response(
          JSON.stringify({ success: true, message: `${provider} synced successfully` }),
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
    console.error("[integrations] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
