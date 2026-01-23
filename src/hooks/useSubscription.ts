import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { PLANS, PlanKey } from "@/lib/billing";

interface SubscriptionState {
  subscribed: boolean;
  plan: PlanKey | null;
  subscriptionEnd: string | null;
  subscriptionStart: string | null;
  callsLimit: number;
  minutesLimit: number;
  isLoading: boolean;
  error: string | null;
}

interface UsageState {
  callsCount: number;
  minutesCount: number;
  overageCents: number;
  month: string | null;
  isLoading: boolean;
}

export function useSubscription() {
  const { currentCompany } = useCompany();
  const [subscription, setSubscription] = useState<SubscriptionState>({
    subscribed: false,
    plan: null,
    subscriptionEnd: null,
    subscriptionStart: null,
    callsLimit: 0,
    minutesLimit: 0,
    isLoading: true,
    error: null,
  });

  const [usage, setUsage] = useState<UsageState>({
    callsCount: 0,
    minutesCount: 0,
    overageCents: 0,
    month: null,
    isLoading: true,
  });

  const checkSubscription = useCallback(async () => {
    if (!currentCompany?.id) {
      setSubscription((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      setSubscription((prev) => ({ ...prev, isLoading: true, error: null }));

      const { data, error } = await supabase.functions.invoke("check-subscription", {
        body: { company_id: currentCompany.id },
      });

      if (error) throw error;

      setSubscription({
        subscribed: data.subscribed || false,
        plan: data.plan || null,
        subscriptionEnd: data.subscription_end || null,
        subscriptionStart: data.subscription_start || null,
        callsLimit: data.calls_limit || 0,
        minutesLimit: data.minutes_limit || 0,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error("Error checking subscription:", err);
      setSubscription((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to check subscription",
      }));
    }
  }, [currentCompany?.id]);

  const fetchUsage = useCallback(async () => {
    if (!currentCompany?.id) {
      setUsage((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      setUsage((prev) => ({ ...prev, isLoading: true }));

      // Get current month's usage
      const currentMonth = new Date().toISOString().slice(0, 7) + "-01";

      const { data, error } = await supabase
        .from("usage")
        .select("*")
        .eq("company_id", currentCompany.id)
        .eq("month", currentMonth)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      setUsage({
        callsCount: data?.calls_count || 0,
        minutesCount: data?.minutes_count || 0,
        overageCents: data?.overage_cents || 0,
        month: data?.month || currentMonth,
        isLoading: false,
      });
    } catch (err) {
      console.error("Error fetching usage:", err);
      setUsage((prev) => ({ ...prev, isLoading: false }));
    }
  }, [currentCompany?.id]);

  const startCheckout = useCallback(
    async (planKey: PlanKey) => {
      if (!currentCompany?.id) {
        throw new Error("No company selected");
      }

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan_key: planKey, company_id: currentCompany.id },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    },
    [currentCompany?.id]
  );

  const openCustomerPortal = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("customer-portal");

    if (error) throw error;

    if (data?.url) {
      window.open(data.url, "_blank");
    }
  }, []);

  // Check subscription on mount and when company changes
  useEffect(() => {
    checkSubscription();
    fetchUsage();
  }, [checkSubscription, fetchUsage]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      checkSubscription();
      fetchUsage();
    }, 60000);

    return () => clearInterval(interval);
  }, [checkSubscription, fetchUsage]);

  const currentPlanConfig = subscription.plan ? PLANS[subscription.plan] : null;

  return {
    subscription,
    usage,
    currentPlanConfig,
    checkSubscription,
    fetchUsage,
    startCheckout,
    openCustomerPortal,
  };
}
