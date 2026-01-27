import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AcceptTrialRequest {
  token: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token }: AcceptTrialRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userToken = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(userToken);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the trial invite
    const { data: invite, error: inviteError } = await supabase
      .from("trial_invites")
      .select("*")
      .eq("token", token)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (inviteError || !invite) {
      console.error("Trial invite not found or expired:", inviteError);
      return new Response(
        JSON.stringify({ error: "Trial invite not found or expired" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing trial invite:", invite);

    // Create the company
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        name: invite.company_name,
        industry: null,
        timezone: "America/New_York",
        status: "active",
        ai_enabled: true,
      })
      .select("id")
      .single();

    if (companyError) {
      console.error("Error creating company:", companyError);
      return new Response(
        JSON.stringify({ error: "Failed to create company" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Company created:", company.id);

    // Create membership for the user as company_owner
    const { error: membershipError } = await supabase
      .from("memberships")
      .insert({
        user_id: userData.user.id,
        company_id: company.id,
        role: "company_owner",
      });

    if (membershipError) {
      console.error("Error creating membership:", membershipError);
      return new Response(
        JSON.stringify({ error: "Failed to create membership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Membership created for user:", userData.user.id);

    // Calculate trial end date
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + invite.trial_days);

    // Create subscription with trial
    const { error: subscriptionError } = await supabase
      .from("subscriptions")
      .insert({
        company_id: company.id,
        plan: invite.plan,
        status: "trialing",
        current_period_start: new Date().toISOString(),
        current_period_end: trialEnd.toISOString(),
        calls_limit: invite.plan === "pro" ? 500 : 100,
        minutes_limit: invite.plan === "pro" ? 1000 : 200,
      });

    if (subscriptionError) {
      console.error("Error creating subscription:", subscriptionError);
      return new Response(
        JSON.stringify({ error: "Failed to create subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Trial subscription created");

    // Create default AI profile
    await supabase.from("ai_profiles").insert({ company_id: company.id });

    // Mark invite as accepted
    await supabase
      .from("trial_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    console.log("Trial invite accepted successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        company_id: company.id,
        plan: invite.plan,
        trial_days: invite.trial_days,
        trial_end: trialEnd.toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error accepting trial invite:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to accept trial invite" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
