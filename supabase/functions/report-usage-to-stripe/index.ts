import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function reports overage usage to Stripe for metered billing
// It should be called at the end of each billing period or on-demand

interface UsageRecord {
  id: string;
  company_id: string;
  month: string;
  minutes_count: number;
  overage_cents: number;
}

interface SubscriptionRecord {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  minutes_limit: number;
  plan: string;
}

interface CompanyRecord {
  id: string;
  name: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeSecretKey) {
    console.error("[report-usage-to-stripe] STRIPE_SECRET_KEY not configured");
    return new Response(
      JSON.stringify({ error: "Stripe not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

  try {
    const body = await req.json().catch(() => ({}));
    const { company_id, month } = body as { company_id?: string; month?: string };

    // Default to current month if not specified
    const targetMonth = month || new Date().toISOString().slice(0, 7) + "-01";

    console.log(`[report-usage-to-stripe] Processing usage for month: ${targetMonth}, company: ${company_id || "all"}`);

    // Build query for usage records with overage
    let usageQuery = supabase
      .from("usage")
      .select("id, company_id, month, minutes_count, overage_cents")
      .eq("month", targetMonth)
      .gt("overage_cents", 0);

    if (company_id) {
      usageQuery = usageQuery.eq("company_id", company_id);
    }

    const { data: usageRecords, error: usageError } = await usageQuery;

    if (usageError) {
      throw usageError;
    }

    if (!usageRecords || usageRecords.length === 0) {
      console.log("[report-usage-to-stripe] No overage usage to report");
      return new Response(
        JSON.stringify({ success: true, message: "No overage usage to report", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[report-usage-to-stripe] Found ${usageRecords.length} usage records with overage`);

    const results: Array<{ company_id: string; success: boolean; error?: string; invoice_id?: string }> = [];

    for (const usage of usageRecords as UsageRecord[]) {
      try {
        // Get subscription with Stripe IDs
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("stripe_subscription_id, stripe_customer_id, minutes_limit, plan")
          .eq("company_id", usage.company_id)
          .single();

        const sub = subscription as SubscriptionRecord | null;

        if (!sub?.stripe_customer_id) {
          console.warn(`[report-usage-to-stripe] No Stripe customer for company ${usage.company_id}`);
          results.push({ company_id: usage.company_id, success: false, error: "No Stripe customer" });
          continue;
        }

        // Get company name for invoice description
        const { data: company } = await supabase
          .from("companies")
          .select("id, name")
          .eq("id", usage.company_id)
          .single();

        const companyName = (company as CompanyRecord | null)?.name || "Unknown";
        const overageMinutes = Math.ceil((usage.minutes_count - sub.minutes_limit));

        if (overageMinutes <= 0) {
          console.log(`[report-usage-to-stripe] No overage minutes for company ${usage.company_id}`);
          continue;
        }

        console.log(`[report-usage-to-stripe] Creating invoice item for ${companyName}: ${overageMinutes} overage minutes = $${(usage.overage_cents / 100).toFixed(2)}`);

        // Create an invoice item for the overage
        await stripe.invoiceItems.create({
          customer: sub.stripe_customer_id,
          amount: usage.overage_cents,
          currency: "usd",
          description: `Overage: ${overageMinutes} additional minutes @ $0.15/min for ${targetMonth.slice(0, 7)}`,
          metadata: {
            company_id: usage.company_id,
            month: targetMonth,
            overage_minutes: overageMinutes.toString(),
            rate_cents_per_minute: "15",
          },
        });

        console.log(`[report-usage-to-stripe] Created invoice item for ${companyName}`);

        // Log to system events
        await supabase.from("system_events").insert({
          company_id: usage.company_id,
          event_type: "overage_billed",
          source: "report-usage-to-stripe",
          message: `Overage billed: ${overageMinutes} minutes = $${(usage.overage_cents / 100).toFixed(2)}`,
          metadata: {
            month: targetMonth,
            overage_minutes: overageMinutes,
            overage_cents: usage.overage_cents,
            stripe_customer_id: sub.stripe_customer_id,
          },
        });

        results.push({ company_id: usage.company_id, success: true });
      } catch (companyError) {
        console.error(`[report-usage-to-stripe] Error processing company ${usage.company_id}:`, companyError);
        results.push({
          company_id: usage.company_id,
          success: false,
          error: companyError instanceof Error ? companyError.message : String(companyError),
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`[report-usage-to-stripe] Completed: ${successful} successful, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        successful,
        failed,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[report-usage-to-stripe] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
