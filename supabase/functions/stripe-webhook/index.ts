import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Plan configuration - must match create-checkout
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

const getPlanKeyFromProductId = (productId: string): string | null => {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.product_id === productId) return key;
  }
  return null;
};

const getPlanKeyFromPriceId = (priceId: string): string | null => {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.price_id === priceId) return key;
  }
  return null;
};

// Log system event for debugging
// deno-lint-ignore no-explicit-any
async function logSystemEvent(
  supabase: any,
  eventType: string,
  message: string,
  companyId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("system_events").insert({
      source: "stripe-webhook",
      event_type: eventType,
      message,
      company_id: companyId,
      metadata,
    });
  } catch (err) {
    console.error("[STRIPE-WEBHOOK] Failed to log system event:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
      },
    });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        logStep("Webhook signature verified");
      } catch (err) {
        logStep("Webhook signature verification failed", { error: String(err) });
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      // No webhook secret - parse body directly (for testing)
      event = JSON.parse(body) as Stripe.Event;
      logStep("No webhook secret configured - processing without signature verification");
    }

    logStep("Processing event", { type: event.type, id: event.id });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Checkout session completed", {
          sessionId: session.id,
          customerId: session.customer,
          subscriptionId: session.subscription,
          metadata: session.metadata,
        });

        const companyId = session.metadata?.company_id;
        const planKey = session.metadata?.plan_key || "starter";
        const planConfig = PLANS[planKey as keyof typeof PLANS] || PLANS.starter;

        if (companyId && session.subscription) {
          // Fetch subscription details from Stripe
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const subscriptionData = {
            company_id: companyId,
            plan: planKey,
            status: "active",
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            calls_limit: planConfig.calls_limit,
            minutes_limit: planConfig.minutes_limit,
          };

          // Upsert subscription
          const { error } = await supabase
            .from("subscriptions")
            .upsert(subscriptionData, { onConflict: "company_id" });

          if (error) {
            logStep("Error upserting subscription", { error: error.message });
            await logSystemEvent(supabase, "error", `Failed to activate subscription: ${error.message}`, companyId, {
              session_id: session.id,
              error: error.message,
            });
          } else {
            logStep("Subscription activated successfully", { companyId, plan: planKey });
            await logSystemEvent(supabase, "billing", `Subscription activated: ${planKey} plan`, companyId, {
              session_id: session.id,
              plan: planKey,
              subscription_id: subscription.id,
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;

        logStep("Subscription updated", {
          subscriptionId: subscription.id,
          status: subscription.status,
          companyId,
        });

        if (companyId) {
          const productId = subscription.items.data[0]?.price?.product as string;
          const planKey = getPlanKeyFromProductId(productId) || "starter";
          const planConfig = PLANS[planKey as keyof typeof PLANS] || PLANS.starter;

          const isActive = ["active", "trialing"].includes(subscription.status);

          const { error } = await supabase
            .from("subscriptions")
            .update({
              plan: planKey,
              status: isActive ? "active" : "inactive",
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              calls_limit: planConfig.calls_limit,
              minutes_limit: planConfig.minutes_limit,
            })
            .eq("company_id", companyId);

          if (error) {
            logStep("Error updating subscription", { error: error.message });
          } else {
            logStep("Subscription updated in database");
            await logSystemEvent(supabase, "billing", `Subscription updated: ${subscription.status}`, companyId, {
              subscription_id: subscription.id,
              status: subscription.status,
              plan: planKey,
            });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;

        logStep("Subscription deleted", { subscriptionId: subscription.id, companyId });

        if (companyId) {
          const { error } = await supabase
            .from("subscriptions")
            .update({ status: "canceled" })
            .eq("company_id", companyId);

          if (error) {
            logStep("Error marking subscription as canceled", { error: error.message });
          } else {
            logStep("Subscription marked as canceled");
            await logSystemEvent(supabase, "billing", "Subscription canceled", companyId, {
              subscription_id: subscription.id,
            });
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        logStep("Payment succeeded", { invoiceId: invoice.id, subscriptionId });

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const companyId = subscription.metadata?.company_id;

          if (companyId) {
            await logSystemEvent(supabase, "billing", "Payment succeeded", companyId, {
              invoice_id: invoice.id,
              amount_paid: invoice.amount_paid,
              subscription_id: subscriptionId,
            });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        logStep("Payment failed", { invoiceId: invoice.id, subscriptionId });

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const companyId = subscription.metadata?.company_id;

          if (companyId) {
            // Mark subscription as past_due
            await supabase
              .from("subscriptions")
              .update({ status: "past_due" })
              .eq("company_id", companyId);

            await logSystemEvent(supabase, "error", "Payment failed - subscription at risk", companyId, {
              invoice_id: invoice.id,
              subscription_id: subscriptionId,
            });
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
