import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

interface MetricData {
  companyId: string;
  endpoint: string;
  success: boolean;
  latencyMs: number;
  errorMessage?: string;
}

interface WebhookMetricRecord {
  success: boolean;
  latency_ms: number;
}

interface CallMetricRecord {
  outcome: string | null;
  cost_cents: number | null;
}

export async function recordMetric(
  supabase: ReturnType<typeof createClient>,
  data: MetricData
): Promise<void> {
  try {
    await supabase.from("webhook_metrics").insert({
      company_id: data.companyId,
      endpoint: data.endpoint,
      success: data.success,
      latency_ms: data.latencyMs,
      error_message: data.errorMessage || null,
    });
  } catch (error) {
    console.error("[metrics] Error recording metric:", error);
  }
}

export interface MetricsSummary {
  totalCalls: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  escalationCount: number;
  escalationRate: number;
  totalCostCents: number;
  avgCostPerCall: number;
}

export async function getMetricsSummary(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<MetricsSummary> {
  try {
    // Get webhook metrics
    const { data: metricsData } = await supabase
      .from("webhook_metrics")
      .select("success, latency_ms")
      .eq("company_id", companyId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    // Get call metrics
    const { data: callsData } = await supabase
      .from("calls")
      .select("outcome, cost_cents")
      .eq("company_id", companyId)
      .gte("started_at", startDate.toISOString())
      .lte("started_at", endDate.toISOString());

    const metrics = (metricsData || []) as WebhookMetricRecord[];
    const calls = (callsData || []) as CallMetricRecord[];

    const totalCalls = calls.length;
    const errorCount = metrics.filter((m) => !m.success).length;
    const totalMetrics = metrics.length || 1;
    const errorRate = (errorCount / totalMetrics) * 100;
    
    const avgLatencyMs = metrics.length
      ? metrics.reduce((sum, m) => sum + (m.latency_ms || 0), 0) / metrics.length
      : 0;

    const escalationCount = calls.filter((c) => c.outcome === "escalated").length;
    const escalationRate = totalCalls > 0 ? (escalationCount / totalCalls) * 100 : 0;

    const totalCostCents = calls.reduce((sum, c) => sum + (c.cost_cents || 0), 0);
    const avgCostPerCall = totalCalls > 0 ? totalCostCents / totalCalls : 0;

    return {
      totalCalls,
      errorCount,
      errorRate: Math.round(errorRate * 100) / 100,
      avgLatencyMs: Math.round(avgLatencyMs),
      escalationCount,
      escalationRate: Math.round(escalationRate * 100) / 100,
      totalCostCents,
      avgCostPerCall: Math.round(avgCostPerCall * 100) / 100,
    };
  } catch (error) {
    console.error("[metrics] Error getting summary:", error);
    return {
      totalCalls: 0,
      errorCount: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      escalationCount: 0,
      escalationRate: 0,
      totalCostCents: 0,
      avgCostPerCall: 0,
    };
  }
}

// Timer helper for measuring latency
export class LatencyTimer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  elapsed(): number {
    return Date.now() - this.startTime;
  }
}
