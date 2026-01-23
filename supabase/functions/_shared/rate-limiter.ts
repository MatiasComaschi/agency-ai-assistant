import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitRecord {
  id: string;
  request_count: number;
  window_start: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 60,
  windowSeconds: 60,
};

export async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  identifier: string,
  endpoint: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000);

  try {
    // Check existing rate limit record
    const { data, error: fetchError } = await supabase
      .from("rate_limits")
      .select("id, request_count, window_start")
      .eq("identifier", identifier)
      .eq("endpoint", endpoint)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("[rate-limiter] Error fetching rate limit:", fetchError);
      // On error, allow the request (fail open for webhooks)
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(now.getTime() + config.windowSeconds * 1000),
      };
    }

    const existing = data as RateLimitRecord | null;

    if (existing) {
      const recordWindowStart = new Date(existing.window_start);

      // Check if window has expired
      if (recordWindowStart < windowStart) {
        // Reset the window
        await supabase
          .from("rate_limits")
          .update({
            request_count: 1,
            window_start: now.toISOString(),
          })
          .eq("id", existing.id);

        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetAt: new Date(now.getTime() + config.windowSeconds * 1000),
        };
      }

      // Check if over limit
      if (existing.request_count >= config.maxRequests) {
        const resetAt = new Date(recordWindowStart.getTime() + config.windowSeconds * 1000);
        return {
          allowed: false,
          remaining: 0,
          resetAt,
        };
      }

      // Increment counter
      await supabase
        .from("rate_limits")
        .update({
          request_count: existing.request_count + 1,
        })
        .eq("id", existing.id);

      return {
        allowed: true,
        remaining: config.maxRequests - existing.request_count - 1,
        resetAt: new Date(recordWindowStart.getTime() + config.windowSeconds * 1000),
      };
    }

    // Create new rate limit record
    await supabase.from("rate_limits").insert({
      identifier,
      endpoint,
      request_count: 1,
      window_start: now.toISOString(),
    });

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: new Date(now.getTime() + config.windowSeconds * 1000),
    };
  } catch (error) {
    console.error("[rate-limiter] Unexpected error:", error);
    // Fail open for webhooks
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now.getTime() + config.windowSeconds * 1000),
    };
  }
}

export function rateLimitResponse(resetAt: Date): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString(),
        "X-RateLimit-Reset": resetAt.toISOString(),
      },
    }
  );
}
