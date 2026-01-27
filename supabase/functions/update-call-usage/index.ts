import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Overage rate: $0.15 per minute = 15 cents
const OVERAGE_RATE_CENTS = 15;

interface UsageRecord {
  id: string;
  calls_count: number;
  minutes_count: number;
  overage_cents: number;
}

interface SubscriptionRecord {
  plan: string;
  calls_limit: number;
  minutes_limit: number;
  status: string;
}

interface UpdateRequest {
  company_id: string;
  call_id: string;
  duration_seconds: number;
}

// Calculate overage based on minutes used vs included
function calculateOverage(minutesUsed: number, minutesIncluded: number): number {
  const overageMinutes = Math.max(0, minutesUsed - minutesIncluded);
  return overageMinutes * OVERAGE_RATE_CENTS;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: UpdateRequest = await req.json();
    const { company_id, call_id, duration_seconds } = body;

    if (!company_id || !call_id || typeof duration_seconds !== "number") {
      return new Response(
        JSON.stringify({ error: "Missing required fields: company_id, call_id, duration_seconds" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[update-call-usage] Updating usage for company ${company_id}, call ${call_id}, duration ${duration_seconds}s`);

    // Calculate minutes (round up to nearest minute for billing)
    const durationMinutes = Math.ceil(duration_seconds / 60);

    // Get current month (YYYY-MM-01 format)
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";

    // Get subscription to know the limits
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("plan, calls_limit, minutes_limit, status")
      .eq("company_id", company_id)
      .single();

    const sub = subscription as SubscriptionRecord | null;
    const minutesLimit = sub?.minutes_limit || 200; // Default to starter limits

    console.log(`[update-call-usage] Subscription: ${sub?.plan || "none"}, limit: ${minutesLimit} minutes`);

    // Get or create usage record for this month
    const { data: existingUsage } = await supabase
      .from("usage")
      .select("id, calls_count, minutes_count, overage_cents")
      .eq("company_id", company_id)
      .eq("month", currentMonth)
      .single();

    const existing = existingUsage as UsageRecord | null;

    let newMinutesCount: number;
    let newOverageCents: number;

    if (existing) {
      // Update existing record
      newMinutesCount = existing.minutes_count + durationMinutes;
      newOverageCents = calculateOverage(newMinutesCount, minutesLimit);

      const { error: updateError } = await supabase
        .from("usage")
        .update({
          minutes_count: newMinutesCount,
          overage_cents: newOverageCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("[update-call-usage] Error updating usage:", updateError);
        throw updateError;
      }

      console.log(`[update-call-usage] Updated usage: ${existing.minutes_count} → ${newMinutesCount} minutes, overage: $${(newOverageCents / 100).toFixed(2)}`);
    } else {
      // Create new usage record
      newMinutesCount = durationMinutes;
      newOverageCents = calculateOverage(newMinutesCount, minutesLimit);

      const { error: insertError } = await supabase
        .from("usage")
        .insert({
          company_id,
          month: currentMonth,
          calls_count: 1, // Already incremented in inbound, but safe to set
          minutes_count: newMinutesCount,
          overage_cents: newOverageCents,
        });

      if (insertError) {
        console.error("[update-call-usage] Error creating usage:", insertError);
        throw insertError;
      }

      console.log(`[update-call-usage] Created usage record: ${newMinutesCount} minutes, overage: $${(newOverageCents / 100).toFixed(2)}`);
    }

    // Update the call record with duration
    const { error: callUpdateError } = await supabase
      .from("calls")
      .update({
        duration_seconds,
      })
      .eq("id", call_id);

    if (callUpdateError) {
      console.error("[update-call-usage] Error updating call duration:", callUpdateError);
    }

    // Log usage update to system events
    await supabase.from("system_events").insert({
      company_id,
      event_type: "usage_update",
      source: "update-call-usage",
      message: `Call ${call_id} added ${durationMinutes} minutes. Total: ${newMinutesCount}/${minutesLimit} minutes.`,
      metadata: {
        call_id,
        duration_seconds,
        duration_minutes: durationMinutes,
        total_minutes: newMinutesCount,
        minutes_limit: minutesLimit,
        overage_cents: newOverageCents,
        month: currentMonth,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        minutes_added: durationMinutes,
        total_minutes: newMinutesCount,
        minutes_limit: minutesLimit,
        overage_cents: newOverageCents,
        overage_dollars: (newOverageCents / 100).toFixed(2),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[update-call-usage] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
