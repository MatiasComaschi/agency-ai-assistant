import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get auth header to identify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use anon client to verify user
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      console.error("User auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to manage invite and membership
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch invite
    const { data: invite, error: inviteError } = await supabase
      .from("company_invites")
      .select("id, token, email, role, company_id, accepted_at, expires_at, companies(name)")
      .eq("token", token)
      .maybeSingle();

    if (inviteError || !invite) {
      console.error("Invite fetch error:", inviteError);
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.accepted_at) {
      return new Response(
        JSON.stringify({ error: "Invite already accepted" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Invite has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyData = invite.companies as unknown as { name: string } | null;
    const companyName = companyData?.name || "Unknown Company";

    // Check if user is already a member
    const { data: existingMembership } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", invite.company_id)
      .maybeSingle();

    if (existingMembership) {
      // Already a member, just mark invite as accepted
      await supabase
        .from("company_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          alreadyMember: true,
          companyId: invite.company_id,
          companyName 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create membership
    const { error: membershipError } = await supabase.from("memberships").insert({
      user_id: user.id,
      company_id: invite.company_id,
      role: invite.role,
    });

    if (membershipError) {
      console.error("Membership creation error:", membershipError);
      return new Response(
        JSON.stringify({ error: "Failed to create membership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark invite as accepted
    await supabase
      .from("company_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    console.log(`User ${user.id} joined company ${invite.company_id} as ${invite.role}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        companyId: invite.company_id,
        companyName,
        role: invite.role
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error accepting invite:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to accept invite" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
