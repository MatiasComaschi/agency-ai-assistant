import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This cron function handles:
// 1. Trial expiration reminders (3-day and 1-day warnings)
// 2. Trial expiration enforcement (mark expired trials as inactive)
// 3. Billing period end processing (report usage to Stripe)

interface SubscriptionRecord {
  id: string;
  company_id: string;
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  minutes_limit: number;
}

interface CompanyRecord {
  id: string;
  name: string;
}

interface UsageRecord {
  id: string;
  company_id: string;
  month: string;
  minutes_count: number;
  overage_cents: number;
}

interface MembershipWithProfile {
  user_id: string;
  role: string;
  profiles: {
    email: string;
    full_name: string | null;
  } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const results = {
    trial_reminders_sent: 0,
    trials_expired: 0,
    usage_reported: 0,
    errors: [] as string[],
  };

  const now = new Date();

  try {
    // ============================================================
    // 1. TRIAL EXPIRATION REMINDERS (3-day and 1-day)
    // ============================================================
    console.log("[billing-cron] Checking for trial expiration reminders...");

    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDayStart = new Date(threeDaysFromNow);
    threeDayStart.setHours(0, 0, 0, 0);
    const threeDayEnd = new Date(threeDaysFromNow);
    threeDayEnd.setHours(23, 59, 59, 999);

    const oneDayFromNow = new Date(now);
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
    const oneDayStart = new Date(oneDayFromNow);
    oneDayStart.setHours(0, 0, 0, 0);
    const oneDayEnd = new Date(oneDayFromNow);
    oneDayEnd.setHours(23, 59, 59, 999);

    // Get trialing subscriptions expiring in 3 days
    const { data: threeDayTrials } = await supabase
      .from("subscriptions")
      .select("id, company_id, plan, current_period_end")
      .eq("status", "trialing")
      .gte("current_period_end", threeDayStart.toISOString())
      .lte("current_period_end", threeDayEnd.toISOString());

    // Get trialing subscriptions expiring in 1 day
    const { data: oneDayTrials } = await supabase
      .from("subscriptions")
      .select("id, company_id, plan, current_period_end")
      .eq("status", "trialing")
      .gte("current_period_end", oneDayStart.toISOString())
      .lte("current_period_end", oneDayEnd.toISOString());

    // Send 3-day reminder emails
    if (threeDayTrials && threeDayTrials.length > 0 && resendApiKey) {
      for (const trial of threeDayTrials) {
        try {
          await sendTrialReminderEmail(supabase, resendApiKey, trial.company_id, trial.plan, 3);
          results.trial_reminders_sent++;

          await supabase.from("system_events").insert({
            company_id: trial.company_id,
            event_type: "trial_reminder",
            source: "billing-cron",
            message: `3-day trial expiration reminder sent`,
            metadata: { days_remaining: 3, plan: trial.plan },
          });
        } catch (err) {
          console.error(`[billing-cron] Error sending 3-day reminder for ${trial.company_id}:`, err);
          results.errors.push(`3-day reminder failed: ${trial.company_id}`);
        }
      }
    }

    // Send 1-day reminder emails
    if (oneDayTrials && oneDayTrials.length > 0 && resendApiKey) {
      for (const trial of oneDayTrials) {
        try {
          await sendTrialReminderEmail(supabase, resendApiKey, trial.company_id, trial.plan, 1);
          results.trial_reminders_sent++;

          await supabase.from("system_events").insert({
            company_id: trial.company_id,
            event_type: "trial_reminder",
            source: "billing-cron",
            message: `1-day trial expiration reminder sent`,
            metadata: { days_remaining: 1, plan: trial.plan },
          });
        } catch (err) {
          console.error(`[billing-cron] Error sending 1-day reminder for ${trial.company_id}:`, err);
          results.errors.push(`1-day reminder failed: ${trial.company_id}`);
        }
      }
    }

    // ============================================================
    // 2. TRIAL EXPIRATION ENFORCEMENT
    // ============================================================
    console.log("[billing-cron] Checking for expired trials...");

    const { data: expiredTrials, error: expiredError } = await supabase
      .from("subscriptions")
      .select("id, company_id, plan")
      .eq("status", "trialing")
      .lt("current_period_end", now.toISOString());

    if (expiredError) {
      console.error("[billing-cron] Error fetching expired trials:", expiredError);
    } else if (expiredTrials && expiredTrials.length > 0) {
      for (const trial of expiredTrials) {
        try {
          // Mark subscription as inactive
          await supabase
            .from("subscriptions")
            .update({ status: "inactive" })
            .eq("id", trial.id);

          // Disable AI for the company
          await supabase
            .from("companies")
            .update({ ai_enabled: false })
            .eq("id", trial.company_id);

          results.trials_expired++;

          await supabase.from("system_events").insert({
            company_id: trial.company_id,
            event_type: "trial_expired",
            source: "billing-cron",
            message: `Trial expired - subscription marked inactive, AI disabled`,
            metadata: { plan: trial.plan },
          });

          // Send expiration notification email
          if (resendApiKey) {
            await sendTrialExpiredEmail(supabase, resendApiKey, trial.company_id, trial.plan);
          }
        } catch (err) {
          console.error(`[billing-cron] Error expiring trial for ${trial.company_id}:`, err);
          results.errors.push(`Trial expiration failed: ${trial.company_id}`);
        }
      }
    }

    // ============================================================
    // 3. BILLING PERIOD END PROCESSING
    // ============================================================
    console.log("[billing-cron] Checking for billing period ends...");

    if (stripeSecretKey) {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

      // Find subscriptions whose billing period ended today
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const { data: endingPeriods } = await supabase
        .from("subscriptions")
        .select("id, company_id, stripe_customer_id, minutes_limit")
        .eq("status", "active")
        .gte("current_period_end", todayStart.toISOString())
        .lte("current_period_end", todayEnd.toISOString())
        .not("stripe_customer_id", "is", null);

      if (endingPeriods && endingPeriods.length > 0) {
        const currentMonth = now.toISOString().slice(0, 7) + "-01";

        for (const sub of endingPeriods as SubscriptionRecord[]) {
          try {
            // Get usage for this month
            const { data: usage } = await supabase
              .from("usage")
              .select("id, company_id, month, minutes_count, overage_cents")
              .eq("company_id", sub.company_id)
              .eq("month", currentMonth)
              .single();

            if (usage && (usage as UsageRecord).overage_cents > 0 && sub.stripe_customer_id) {
              const usageRecord = usage as UsageRecord;
              const overageMinutes = Math.max(0, usageRecord.minutes_count - sub.minutes_limit);

              // Create invoice item for overage
              await stripe.invoiceItems.create({
                customer: sub.stripe_customer_id,
                amount: usageRecord.overage_cents,
                currency: "usd",
                description: `Overage: ${overageMinutes} additional minutes @ $0.15/min for ${currentMonth.slice(0, 7)}`,
                metadata: {
                  company_id: sub.company_id,
                  month: currentMonth,
                  overage_minutes: overageMinutes.toString(),
                  rate_cents_per_minute: "15",
                },
              });

              results.usage_reported++;

              await supabase.from("system_events").insert({
                company_id: sub.company_id,
                event_type: "overage_billed",
                source: "billing-cron",
                message: `Overage billed: ${overageMinutes} minutes = $${(usageRecord.overage_cents / 100).toFixed(2)}`,
                metadata: {
                  month: currentMonth,
                  overage_minutes: overageMinutes,
                  overage_cents: usageRecord.overage_cents,
                },
              });
            }
          } catch (err) {
            console.error(`[billing-cron] Error processing billing for ${sub.company_id}:`, err);
            results.errors.push(`Billing processing failed: ${sub.company_id}`);
          }
        }
      }
    }

    console.log("[billing-cron] Cron completed:", results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[billing-cron] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to send trial reminder emails
async function sendTrialReminderEmail(
  supabase: any,
  resendApiKey: string,
  companyId: string,
  plan: string,
  daysRemaining: number
) {
  // Get company info
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .single();

  if (!company) return;

  // Get company owner email
  const { data: memberships } = await supabase
    .from("memberships")
    .select("user_id, role, profiles:profiles!inner(email, full_name)")
    .eq("company_id", companyId)
    .eq("role", "company_owner");

  if (!memberships || memberships.length === 0) return;

  const ownerEmails = (memberships as unknown as MembershipWithProfile[])
    .filter((m) => m.profiles?.email)
    .map((m) => m.profiles!.email);

  if (ownerEmails.length === 0) return;

  const planLabel = plan === "pro" ? "Pro" : "Starter";
  const urgencyColor = daysRemaining === 1 ? "#ef4444" : "#f59e0b";
  const urgencyText = daysRemaining === 1 ? "Tomorrow" : `in ${daysRemaining} days`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AI Reception <notifications@resend.dev>",
      to: ownerEmails,
      subject: `⚠️ Your trial expires ${urgencyText} - ${(company as CompanyRecord).name}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: ${urgencyColor}; color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
              .button { display: inline-block; background: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
              .highlight { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid ${urgencyColor}; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⏰ Trial Ending ${urgencyText}</h1>
                <p style="margin: 0; font-size: 18px;">${(company as CompanyRecord).name}</p>
              </div>
              <div class="content">
                <p>Hi,</p>
                <p>Your <strong>${planLabel}</strong> trial for <strong>${(company as CompanyRecord).name}</strong> is expiring ${urgencyText}.</p>
                
                <div class="highlight">
                  <strong>What happens when your trial ends:</strong>
                  <ul style="margin: 10px 0;">
                    <li>AI receptionist will be disabled</li>
                    <li>Calls will be forwarded to your fallback number</li>
                    <li>All your data and settings will be preserved</li>
                  </ul>
                </div>
                
                <p>To continue using AI Reception without interruption, upgrade to a paid subscription today:</p>
                
                <p style="text-align: center;">
                  <a href="https://id-preview--9cc58fa4-a186-4e6e-839c-6c44e6e62e09.lovable.app/billing" class="button">Upgrade Now</a>
                </p>
                
                <p style="font-size: 14px; color: #666;">Questions? Reply to this email and we'll help you out.</p>
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
}

// Helper function to send trial expired notification
async function sendTrialExpiredEmail(
  supabase: any,
  resendApiKey: string,
  companyId: string,
  plan: string
) {
  // Get company info
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .single();

  if (!company) return;

  // Get company owner email
  const { data: memberships } = await supabase
    .from("memberships")
    .select("user_id, role, profiles:profiles!inner(email, full_name)")
    .eq("company_id", companyId)
    .eq("role", "company_owner");

  if (!memberships || memberships.length === 0) return;

  const ownerEmails = (memberships as unknown as MembershipWithProfile[])
    .filter((m) => m.profiles?.email)
    .map((m) => m.profiles!.email);

  if (ownerEmails.length === 0) return;

  const planLabel = plan === "pro" ? "Pro" : "Starter";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AI Reception <notifications@resend.dev>",
      to: ownerEmails,
      subject: `Your trial has ended - ${(company as CompanyRecord).name}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #64748b; color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
              .button { display: inline-block; background: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
              .info { background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 15px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Trial Ended</h1>
                <p style="margin: 0; font-size: 18px;">${(company as CompanyRecord).name}</p>
              </div>
              <div class="content">
                <p>Hi,</p>
                <p>Your <strong>${planLabel}</strong> trial for <strong>${(company as CompanyRecord).name}</strong> has ended.</p>
                
                <div class="info">
                  <strong>Current Status:</strong>
                  <ul style="margin: 10px 0;">
                    <li>AI receptionist has been disabled</li>
                    <li>Calls are being forwarded to your fallback number</li>
                    <li>All your settings and data are safely stored</li>
                  </ul>
                </div>
                
                <p>Ready to continue? Reactivate your account anytime:</p>
                
                <p style="text-align: center;">
                  <a href="https://id-preview--9cc58fa4-a186-4e6e-839c-6c44e6e62e09.lovable.app/billing" class="button">Reactivate Now</a>
                </p>
                
                <p style="font-size: 14px; color: #666;">We're here if you have any questions!</p>
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
}
