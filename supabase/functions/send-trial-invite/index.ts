import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TrialInviteRequest {
  email: string;
  company_name: string;
  plan: string;
  trial_days: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, company_name, plan, trial_days }: TrialInviteRequest = await req.json();

    if (!email || !company_name || !plan) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate the user is an agency admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is agency admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "agency_admin")
      .single();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Only agency admins can send trial invites" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the trial invite record
    const { data: invite, error: insertError } = await supabase
      .from("trial_invites")
      .insert({
        email: email.trim().toLowerCase(),
        company_name,
        plan,
        trial_days,
        invited_by: userData.user.id,
      })
      .select("id, token")
      .single();

    if (insertError) {
      console.error("Error creating trial invite:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create trial invite" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({ success: true, invite_id: invite.id, token: invite.token, emailSent: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate invite link
    const siteUrl = Deno.env.get("SITE_URL") || supabaseUrl.replace(".supabase.co", ".lovable.app").replace("https://", "https://id-preview--");
    const inviteLink = `${siteUrl}/auth?trial=${invite.token}`;

    const planLabel = plan === "pro" ? "Pro" : "Starter";

    // Send invite email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AI Reception <onboarding@resend.dev>",
        to: [email],
        subject: `You're invited to try AI Reception - ${trial_days} Day Free Trial`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
                .button { display: inline-block; background: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
                .highlight { background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🎉 You're Invited!</h1>
                  <p style="margin: 0; font-size: 18px;">${trial_days}-Day Free Trial</p>
                </div>
                <div class="content">
                  <p>Hi,</p>
                  <p>You've been invited to try <strong>AI Reception</strong> for <strong>${company_name}</strong> with a free trial!</p>
                  
                  <div class="highlight">
                    <strong>Your Trial Includes:</strong>
                    <ul style="margin: 10px 0;">
                      <li><strong>${planLabel} Plan</strong> features</li>
                      <li>${trial_days} days of full access</li>
                      <li>No credit card required</li>
                    </ul>
                  </div>
                  
                  <p style="text-align: center;">
                    <a href="${inviteLink}" class="button">Start Your Free Trial</a>
                  </p>
                  <p style="font-size: 12px; color: #666;">Or copy this link: ${inviteLink}</p>
                </div>
                <div class="footer">
                  <p>AI Reception - Smart phone answering for modern businesses</p>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    });

    const emailResult = await emailResponse.json();
    console.log("Trial invite email result:", emailResult);

    if (!emailResponse.ok) {
      console.error("Email send failed:", emailResult);
      return new Response(
        JSON.stringify({ success: true, invite_id: invite.id, token: invite.token, emailSent: false, emailError: emailResult.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, invite_id: invite.id, token: invite.token, emailSent: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending trial invite:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to send trial invite" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
