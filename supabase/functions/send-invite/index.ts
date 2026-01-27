import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  invite_id: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invite_id }: InviteRequest = await req.json();

    if (!invite_id) {
      return new Response(
        JSON.stringify({ error: "Missing invite_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch invite details with company name
    const { data: invite, error: inviteError } = await supabase
      .from("company_invites")
      .select("id, email, role, token, company_id, companies(name)")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) {
      console.error("Error fetching invite:", inviteError);
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyData = invite.companies as unknown as { name: string } | null;
    const companyName = companyData?.name || "a company";

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Email not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate invite link
    const siteUrl = Deno.env.get("SITE_URL") || supabaseUrl.replace(".supabase.co", ".lovable.app").replace("https://", "https://id-preview--");
    const inviteLink = `${siteUrl}/auth?invite=${invite.token}`;

    console.log(`Sending invite email to ${invite.email} for ${companyName}`);

    // Send invite email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AI Reception <onboarding@resend.dev>",
        to: [invite.email],
        subject: `You've been invited to join ${companyName}`,
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
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Welcome to AI Reception</h1>
                </div>
                <div class="content">
                  <p>Hi,</p>
                  <p>You've been invited to join <strong>${companyName}</strong> on AI Reception as a <strong>${invite.role === 'company_owner' ? 'Company Owner' : 'Staff Member'}</strong>.</p>
                  <p style="text-align: center;">
                    <a href="${inviteLink}" class="button">Accept Invitation</a>
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
    console.log("Invite email result:", emailResult);

    if (!emailResponse.ok) {
      console.error("Email send failed:", emailResult);
      return new Response(
        JSON.stringify({ success: false, error: emailResult.message || "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: emailResult.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending invite:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to send invite" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
