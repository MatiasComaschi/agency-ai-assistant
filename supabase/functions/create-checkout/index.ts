import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

// Plan configuration
const PLANS = {
  starter: {
    price_id: "price_1SsnhMLryYhQFO41SQFCtH75",
    product_id: "prod_TqUgkXRzuK5EVD",
    calls_limit: 100,
    minutes_limit: 200,
  },
  pro: {
    price_id: "price_1SsnjALryYhQFO417GLGRrto",
    product_id: "prod_TqUiYhiyfcZ7AL",
    calls_limit: 300,
    minutes_limit: 600,
  },
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
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse request body
    const body = await req.json();
    const { plan_key, company_id } = body;

    if (!plan_key || !PLANS[plan_key as keyof typeof PLANS]) {
      throw new Error("Invalid plan specified");
    }
    if (!company_id) {
      throw new Error("Company ID is required");
    }

    const plan = PLANS[plan_key as keyof typeof PLANS];
    logStep("Plan selected", { plan_key, price_id: plan.price_id });

    // Verify user has access to this company
    const { data: membership } = await supabaseClient
      .from("memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", company_id)
      .single();

    if (!membership || !["company_owner", "agency_admin"].includes(membership.role)) {
      throw new Error("You do not have permission to manage billing for this company");
    }
    logStep("User has billing permission", { role: membership.role });

    // Get company details
    const { data: company } = await supabaseClient
      .from("companies")
      .select("id, name")
      .eq("id", company_id)
      .single();

    if (!company) throw new Error("Company not found");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check for existing customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing Stripe customer", { customerId });
    }

    const origin = req.headers.get("origin") || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: plan.price_id,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/billing?success=true&company_id=${company_id}`,
      cancel_url: `${origin}/billing?canceled=true&company_id=${company_id}`,
      metadata: {
        company_id,
        plan_key,
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          company_id,
          plan_key,
        },
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
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
