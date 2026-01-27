// Centralized plan configuration - single source of truth
// Used by: create-checkout, check-subscription, stripe-webhook, frontend

export const PLANS = {
  starter: {
    name: "Starter",
    price: 399,
    price_id: "price_1SsnhMLryYhQFO41SQFCtH75",
    product_id: "prod_TqUgkXRzuK5EVD",
    calls_limit: 100,
    minutes_limit: 200,
    features: [
      "100 calls/month included",
      "200 minutes included",
      "AI Receptionist",
      "Knowledge Base",
      "Call Logs & Transcripts",
      "Email Support",
    ],
  },
  pro: {
    name: "Pro",
    price: 799,
    price_id: "price_1SsnjALryYhQFO417GLGRrto",
    product_id: "prod_TqUiYhiyfcZ7AL",
    calls_limit: 300,
    minutes_limit: 600,
    features: [
      "300 calls/month included",
      "600 minutes included",
      "Everything in Starter",
      "Calendly Integration",
      "Square Integration",
      "Priority Support",
      "Custom AI Training",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type Plan = typeof PLANS[PlanKey];

// Overage rate: $0.15 per minute
export const OVERAGE_RATE_CENTS = 15;

export const getPlanByProductId = (productId: string): PlanKey | null => {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.product_id === productId) return key as PlanKey;
  }
  return null;
};

export const getPlanByPriceId = (priceId: string): PlanKey | null => {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.price_id === priceId) return key as PlanKey;
  }
  return null;
};

export const calculateOverage = (
  minutesUsed: number,
  minutesIncluded: number
): number => {
  const overageMinutes = Math.max(0, minutesUsed - minutesIncluded);
  return overageMinutes * OVERAGE_RATE_CENTS;
};
