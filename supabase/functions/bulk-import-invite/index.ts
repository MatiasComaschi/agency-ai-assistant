import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  email: string;
  name: string;
  company_id: string;
  company_name: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name, company_id, company_name }: InviteRequest = await req.json();

    if (!email || !company_id || !company_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Email not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate invite link
    const baseUrl = Deno.env.get("SITE_URL") || "https://your-app.lovable.app";
    const inviteLink = `${baseUrl}/auth?invite=${company_id}`;

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
        subject: `You've been invited to manage ${company_name}`,
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
                  <p>Hi${name ? ` ${name}` : ''},</p>
                  <p>You've been invited to manage <strong>${company_name}</strong> on AI Reception.</p>
                  <p style="text-align: center;">
                    <a href="${inviteLink}" class="button">Accept Invitation</a>
                  </p>
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
    console.log("Invite email sent:", emailResult);

    // Log the invite in the database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase.from("audits").insert({
      company_id,
      actor_user_id: "00000000-0000-0000-0000-000000000000",
      action: "invite_sent",
      entity_type: "membership",
      metadata: { email, name },
    });

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
