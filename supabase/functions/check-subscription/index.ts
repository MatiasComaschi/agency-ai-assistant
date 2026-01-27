import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import { PLANS, getPlanByProductId } from "../_shared/plans.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse request body for company_id
    let companyId: string | null = null;
    try {
      const body = await req.json();
      companyId = body.company_id;
    } catch {
      // No body provided, will check all companies
    }

    if (!companyId) {
      // Return general subscription status without company context
      return new Response(JSON.stringify({ 
        subscribed: false,
        message: "No company_id provided" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Checking subscription for company", { companyId });

    // Check if subscription exists in our database first
    const { data: existingSub } = await supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("company_id", companyId)
      .single();

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return new Response(JSON.stringify({ 
        subscribed: false,
        plan: null,
        subscription_end: null,
        calls_limit: 0,
        minutes_limit: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Check for active subscriptions with matching company_id in metadata
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    // Find subscription for this company
    let matchingSubscription: Stripe.Subscription | null = null;
    for (const sub of subscriptions.data) {
      if (sub.metadata.company_id === companyId) {
        matchingSubscription = sub;
        break;
      }
    }

    if (!matchingSubscription) {
      logStep("No active subscription found for company", { companyId });
      
      // Update local subscription to inactive if it exists
      if (existingSub) {
        await supabaseClient
          .from("subscriptions")
          .update({ status: "inactive" })
          .eq("company_id", companyId);
      }

      return new Response(JSON.stringify({ 
        subscribed: false,
        plan: null,
        subscription_end: null,
        calls_limit: 0,
        minutes_limit: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscriptionEnd = new Date(matchingSubscription.current_period_end * 1000).toISOString();
    const subscriptionStart = new Date(matchingSubscription.current_period_start * 1000).toISOString();
    const productId = matchingSubscription.items.data[0].price.product as string;
    const planKey = getPlanByProductId(productId) || "starter";
    const planConfig = PLANS[planKey as keyof typeof PLANS] || PLANS.starter;

    logStep("Active subscription found", { 
      subscriptionId: matchingSubscription.id, 
      planKey,
      endDate: subscriptionEnd 
    });

    // Upsert subscription in our database
    const subscriptionData = {
      company_id: companyId,
      plan: planKey,
      status: "active",
      stripe_customer_id: customerId,
      stripe_subscription_id: matchingSubscription.id,
      current_period_start: subscriptionStart,
      current_period_end: subscriptionEnd,
      calls_limit: planConfig.calls_limit,
      minutes_limit: planConfig.minutes_limit,
    };

    if (existingSub) {
      await supabaseClient
        .from("subscriptions")
        .update(subscriptionData)
        .eq("company_id", companyId);
    } else {
      await supabaseClient
        .from("subscriptions")
        .insert(subscriptionData);
    }

    logStep("Subscription synced to database");

    return new Response(JSON.stringify({
      subscribed: true,
      plan: planKey,
      subscription_end: subscriptionEnd,
      subscription_start: subscriptionStart,
      calls_limit: planConfig.calls_limit,
      minutes_limit: planConfig.minutes_limit,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
