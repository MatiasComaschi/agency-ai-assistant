import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

// Rate limiting inline (can't import from _shared in deployed functions)
interface RateLimitRecord {
  id: string;
  request_count: number;
  window_start: string;
}

// deno-lint-ignore no-explicit-any
async function checkRateLimit(
  supabase: any,
  identifier: string,
  endpoint: string,
  maxRequests = 60,
  windowSeconds = 60
): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  try {
    const { data, error } = await supabase
      .from("rate_limits")
      .select("id, request_count, window_start")
      .eq("identifier", identifier)
      .eq("endpoint", endpoint)
      .single();

    if (error && error.code !== "PGRST116") {
      return { allowed: true, remaining: maxRequests };
    }

    const existing = data as RateLimitRecord | null;

    if (existing) {
      const recordWindowStart = new Date(existing.window_start);
      if (recordWindowStart < windowStart) {
        await supabase
          .from("rate_limits")
          .update({ request_count: 1, window_start: now.toISOString() })
          .eq("id", existing.id);
        return { allowed: true, remaining: maxRequests - 1 };
      }
      if (existing.request_count >= maxRequests) {
        return { allowed: false, remaining: 0 };
      }
      await supabase
        .from("rate_limits")
        .update({ request_count: existing.request_count + 1 })
        .eq("id", existing.id);
      return { allowed: true, remaining: maxRequests - existing.request_count - 1 };
    }

    await supabase.from("rate_limits").insert({
      identifier,
      endpoint,
      request_count: 1,
      window_start: now.toISOString(),
    });
    return { allowed: true, remaining: maxRequests - 1 };
  } catch {
    return { allowed: true, remaining: maxRequests };
  }
}

// Metrics recording
// deno-lint-ignore no-explicit-any
async function recordMetric(
  supabase: any,
  companyId: string,
  endpoint: string,
  success: boolean,
  latencyMs: number,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from("webhook_metrics").insert({
      company_id: companyId,
      endpoint,
      success,
      latency_ms: latencyMs,
      error_message: errorMessage || null,
    });
  } catch (err) {
    console.error("[metrics] Error recording:", err);
  }
}

// Input validation
// Phone number normalization to E.164 format
function normalizeToE164(phone: string): { valid: boolean; normalized: string } {
  if (!phone) return { valid: false, normalized: "" };
  
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, "");
  
  // Ensure it starts with +
  if (!normalized.startsWith("+")) {
    const digits = normalized.replace(/\D/g, "");
    // Assume US number if 10 digits
    if (digits.length === 10) {
      normalized = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      normalized = `+${digits}`;
    } else {
      normalized = `+${digits}`;
    }
  }
  
  // Validate E.164 format: + followed by 7-15 digits
  const valid = /^\+[1-9]\d{6,14}$/.test(normalized);
  return { valid, normalized: valid ? normalized : phone };
}

// Legacy wrapper for backward compatibility
function validatePhoneNumber(phone: string): { valid: boolean; sanitized: string } {
  const result = normalizeToE164(phone);
  return { valid: result.valid, sanitized: result.normalized };
}

function sanitizeString(input: string, maxLength = 1000): string {
  if (!input) return "";
  return input.trim().substring(0, maxLength).replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// TwiML helper functions
const twimlResponse = (body: string): Response => {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { headers: { "Content-Type": "application/xml" } }
  );
};

const say = (text: string, voice = "Polly.Joanna"): string => {
  return `<Say voice="${voice}">${escapeXml(text)}</Say>`;
};

const gather = (options: {
  action: string;
  input?: string;
  timeout?: number;
  speechTimeout?: string;
  hints?: string;
  innerTwiml?: string;
}): string => {
  const attrs = [
    `action="${options.action}"`,
    `input="${options.input || "speech"}"`,
    `timeout="${options.timeout || 3}"`,
    `speechTimeout="${options.speechTimeout || "auto"}"`,
  ];
  if (options.hints) attrs.push(`hints="${options.hints}"`);
  return `<Gather ${attrs.join(" ")}>${options.innerTwiml || ""}</Gather>`;
};

const dial = (number: string, options?: { record?: boolean; action?: string }): string => {
  const attrs: string[] = [];
  if (options?.record) attrs.push('record="record-from-answer-dual"');
  if (options?.action) attrs.push(`action="${options.action}"`);
  return `<Dial ${attrs.join(" ")}>${number}</Dial>`;
};

const record = (options: { action: string; maxLength?: number; transcribe?: boolean }): string => {
  const attrs = [`action="${options.action}"`, `maxLength="${options.maxLength || 120}"`];
  if (options.transcribe) {
    attrs.push(`transcribe="true"`);
    attrs.push(`transcribeCallback="${options.action}"`);
  }
  return `<Record ${attrs.join(" ")} />`;
};

const escapeXml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

// Check if current time is within business hours
const isWithinBusinessHours = (
  hours: Array<{ day_of_week: number; open_time: string; close_time: string; is_closed: boolean }>,
  timezone: string
): boolean => {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekdayName = parts.find((p) => p.type === "weekday")?.value || "";
    const hour = parts.find((p) => p.type === "hour")?.value || "0";
    const minute = parts.find((p) => p.type === "minute")?.value || "0";
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[weekdayName];
    const currentTime = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    const todayHours = hours.find((h) => h.day_of_week === dayOfWeek);
    if (!todayHours || todayHours.is_closed) return false;
    return currentTime >= todayHours.open_time && currentTime <= todayHours.close_time;
  } catch (error) {
    console.error("[twilio-voice-inbound] Error checking business hours:", error);
    return true;
  }
};

// Check if today is a holiday
const isHoliday = (holidays: Array<{ date: string; is_closed: boolean }>, timezone: string): boolean => {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    const todayStr = formatter.format(now);
    return holidays.some((h) => h.date === todayStr && h.is_closed);
  } catch (error) {
    console.error("[twilio-voice-inbound] Error checking holidays:", error);
    return false;
  }
};

// Subscription interfaces
interface SubscriptionStatus {
  isActive: boolean;
  plan: string | null;
  callsLimit: number;
  minutesLimit: number;
  callsUsed: number;
  minutesUsed: number;
}

interface SubscriptionRecord {
  status: string;
  plan: string;
  calls_limit: number;
  minutes_limit: number;
  current_period_end: string | null;
}

interface UsageRecord {
  id: string;
  calls_count: number;
  minutes_count: number;
}

// deno-lint-ignore no-explicit-any
const checkSubscriptionStatus = async (supabase: any, companyId: string): Promise<SubscriptionStatus> => {
  try {
    const { data } = await supabase
      .from("subscriptions")
      .select("status, plan, calls_limit, minutes_limit, current_period_end")
      .eq("company_id", companyId)
      .single();
    const subscription = data as SubscriptionRecord | null;
    if (!subscription || subscription.status !== "active") {
      return { isActive: false, plan: null, callsLimit: 0, minutesLimit: 0, callsUsed: 0, minutesUsed: 0 };
    }
    const now = new Date();
    const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
    if (periodEnd && now > periodEnd) {
      return { isActive: false, plan: subscription.plan, callsLimit: subscription.calls_limit, minutesLimit: subscription.minutes_limit, callsUsed: 0, minutesUsed: 0 };
    }
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    const { data: usageData } = await supabase
      .from("usage")
      .select("id, calls_count, minutes_count")
      .eq("company_id", companyId)
      .eq("month", currentMonth)
      .single();
    const usage = usageData as UsageRecord | null;
    return {
      isActive: true,
      plan: subscription.plan,
      callsLimit: subscription.calls_limit,
      minutesLimit: subscription.minutes_limit,
      callsUsed: usage?.calls_count || 0,
      minutesUsed: usage?.minutes_count || 0,
    };
  } catch (error) {
    console.error("[twilio-voice-inbound] Error checking subscription:", error);
    return { isActive: true, plan: null, callsLimit: 100, minutesLimit: 200, callsUsed: 0, minutesUsed: 0 };
  }
};

// deno-lint-ignore no-explicit-any
const incrementUsage = async (supabase: any, companyId: string): Promise<void> => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    const { data } = await supabase
      .from("usage")
      .select("id, calls_count")
      .eq("company_id", companyId)
      .eq("month", currentMonth)
      .single();
    const existing = data as UsageRecord | null;
    if (existing) {
      await supabase.from("usage").update({ calls_count: existing.calls_count + 1 }).eq("id", existing.id);
    } else {
      await supabase.from("usage").insert({ company_id: companyId, month: currentMonth, calls_count: 1, minutes_count: 0, overage_cents: 0 });
    }
  } catch (error) {
    console.error("[twilio-voice-inbound] Error incrementing usage:", error);
  }
};

Deno.serve(async (req) => {
  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let companyId: string | null = null;

  try {
    // Parse form data from Twilio
    const contentType = req.headers.get("content-type") || "";
    let params: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        params[key] = value.toString();
      }
    } else if (contentType.includes("application/json")) {
      params = await req.json();
    }

    // Normalize phone numbers to E.164 BEFORE any database queries
    const calledResult = normalizeToE164(params.Called || params.To || "");
    const callerResult = normalizeToE164(params.From || params.Caller || "");
    const calledNumber = calledResult.normalized;
    const callerNumber = callerResult.normalized;
    const callSid = sanitizeString(params.CallSid || "", 50);

    console.log("[twilio-voice-inbound] Incoming call:", { 
      calledNumber, 
      callerNumber, 
      callSid,
      calledValid: calledResult.valid,
      callerValid: callerResult.valid,
    });

    if (!calledNumber || !calledResult.valid) {
      console.error("[twilio-voice-inbound] Invalid or missing Called number:", params.Called);
      return twimlResponse(say("We're sorry, but we cannot process your call at this time. Please try again later."));
    }

    // Rate limiting by caller number
    const rateLimit = await checkRateLimit(supabase, callerNumber || "unknown", "twilio-voice-inbound", 30, 60);
    if (!rateLimit.allowed) {
      console.warn("[twilio-voice-inbound] Rate limit exceeded for:", callerNumber);
      return twimlResponse(say("You have made too many calls. Please try again later."));
    }

    // Identify company by twilio_number (using normalized E.164 format)
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, twilio_number, fallback_phone, timezone, ai_enabled")
      .eq("twilio_number", calledNumber)
      .single();

    if (companyError || !company) {
      console.error("[twilio-voice-inbound] Company not found for number:", calledNumber, companyError);
      return twimlResponse(say("We're sorry, but this number is not configured. Please contact support."));
    }

    companyId = company.id;
    console.log("[twilio-voice-inbound] Found company:", company.name, company.id);

    // PANIC SWITCH: Check if AI is enabled
    if (company.ai_enabled === false) {
      console.log("[twilio-voice-inbound] AI disabled (panic switch) - forwarding to fallback");
      
      if (company.fallback_phone) {
        const { data: integration } = await supabase
          .from("integrations")
          .select("config_json")
          .eq("company_id", company.id)
          .eq("provider", "twilio")
          .single();
        const config = (integration?.config_json as Record<string, unknown>) || {};
        const recordCalls = config.record_calls !== false;
        const baseUrl = supabaseUrl.replace("/rest/v1", "");
        const functionsBase = `${baseUrl}/functions/v1`;

        // Create call log
        const { data: callLog } = await supabase
          .from("calls")
          .insert({
            company_id: company.id,
            caller_number: callerNumber,
            started_at: new Date().toISOString(),
            outcome: "ai_disabled",
            extracted_json: { call_sid: callSid, ai_disabled: true },
          })
          .select()
          .single();

        await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);

        return twimlResponse(
          say("Please hold while we connect you with a team member.") +
          dial(company.fallback_phone, {
            record: recordCalls,
            action: `${functionsBase}/twilio-voice-dial-complete?call_id=${callLog?.id || ""}&company_id=${company.id}`,
          })
        );
      } else {
        // No fallback phone - take voicemail
        const baseUrl = supabaseUrl.replace("/rest/v1", "");
        const functionsBase = `${baseUrl}/functions/v1`;
        const { data: callLog } = await supabase
          .from("calls")
          .insert({
            company_id: company.id,
            caller_number: callerNumber,
            started_at: new Date().toISOString(),
            outcome: "ai_disabled",
            extracted_json: { call_sid: callSid, ai_disabled: true },
          })
          .select()
          .single();

        await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);

        return twimlResponse(
          say("We are currently unavailable. Please leave a message after the tone.") +
          record({ action: `${functionsBase}/twilio-voice-voicemail?call_id=${callLog?.id || ""}&company_id=${company.id}`, maxLength: 120, transcribe: true })
        );
      }
    }

    // Check subscription status
    const subscriptionStatus = await checkSubscriptionStatus(supabase, company.id);
    console.log("[twilio-voice-inbound] Subscription status:", subscriptionStatus);

    // Fetch AI profile for scripts and disclosure settings
    const { data: aiProfile } = await supabase
      .from("ai_profiles")
      .select("*")
      .eq("company_id", company.id)
      .single();

    // Fetch Twilio integration config
    const { data: integration } = await supabase
      .from("integrations")
      .select("config_json, status")
      .eq("company_id", company.id)
      .eq("provider", "twilio")
      .single();

    const config = (integration?.config_json as Record<string, unknown>) || {};
    const recordCalls = config.record_calls !== false;
    const afterHoursAction = (config.after_hours_action as string) || "voicemail";

    // Fetch business hours and holidays
    const { data: hours } = await supabase.from("company_hours").select("*").eq("company_id", company.id);
    const { data: holidays } = await supabase.from("company_holidays").select("*").eq("company_id", company.id);

    // Create call log entry
    const { data: callLog, error: callLogError } = await supabase
      .from("calls")
      .insert({
        company_id: company.id,
        caller_number: callerNumber,
        started_at: new Date().toISOString(),
        outcome: "in_progress",
        extracted_json: {
          call_sid: callSid,
          twilio_number: calledNumber,
          subscription_status: subscriptionStatus.isActive ? "active" : "inactive",
        },
      })
      .select()
      .single();

    if (callLogError) {
      console.error("[twilio-voice-inbound] Error creating call log:", callLogError);
    } else {
      console.log("[twilio-voice-inbound] Created call log:", callLog.id);
    }

    // Get scripts from AI profile
    const greetingScript = aiProfile?.greeting_script || "Hello! Thank you for calling. How may I help you today?";
    const disclosureScript = aiProfile?.disclosure_script || "Please note that you are speaking with an AI assistant.";
    const afterHoursScript = aiProfile?.after_hours_script || "We are currently closed. Please leave a message after the tone and we will get back to you as soon as possible.";
    
    // Check if disclosure is required
    const disclosureRequired = aiProfile?.disclosure_required !== false;

    // Build webhook URLs
    const baseUrl = supabaseUrl.replace("/rest/v1", "");
    const functionsBase = `${baseUrl}/functions/v1`;
    const callLogId = callLog?.id || "";

    // Handle inactive subscription - fallback to voicemail or forward
    if (!subscriptionStatus.isActive) {
      console.log("[twilio-voice-inbound] Subscription inactive - using fallback");
      if (callLog) {
        await supabase.from("calls").update({ outcome: "subscription_inactive" }).eq("id", callLog.id);
      }
      const inactiveMessage = "Thank you for calling. We're currently unable to connect you with our AI assistant. ";
      if (company.fallback_phone) {
        await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);
        return twimlResponse(
          say(inactiveMessage + "Please hold while we connect you with a team member.") +
          dial(company.fallback_phone, { record: recordCalls, action: `${functionsBase}/twilio-voice-dial-complete?call_id=${callLogId}&company_id=${company.id}` })
        );
      } else {
        const voicemailAction = `${functionsBase}/twilio-voice-voicemail?call_id=${callLogId}&company_id=${company.id}`;
        await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);
        return twimlResponse(
          say(inactiveMessage + "Please leave your name, number, and a brief message after the tone.") +
          record({ action: voicemailAction, maxLength: 120, transcribe: config.transcribe_calls !== false }) +
          say("We did not receive your message. Goodbye.")
        );
      }
    }

    // Increment usage counter for active subscription
    await incrementUsage(supabase, company.id);

    // Check business hours (per-company allowed_hours enforcement)
    const isHolidayToday = holidays ? isHoliday(holidays, company.timezone) : false;
    const isBusinessHours = hours && hours.length > 0 ? isWithinBusinessHours(hours, company.timezone) : true;
    const isOpen = !isHolidayToday && isBusinessHours;

    console.log("[twilio-voice-inbound] Routing decision:", { isHolidayToday, isBusinessHours, isOpen, afterHoursAction });

    // Route based on business hours
    if (!isOpen) {
      console.log("[twilio-voice-inbound] After hours - action:", afterHoursAction);
      if (callLog) {
        await supabase.from("calls").update({ outcome: "after_hours" }).eq("id", callLog.id);
      }
      if (afterHoursAction === "forward" && company.fallback_phone) {
        await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);
        return twimlResponse(say(afterHoursScript) + dial(company.fallback_phone, { record: recordCalls }));
      } else {
        const voicemailAction = `${functionsBase}/twilio-voice-voicemail?call_id=${callLogId}&company_id=${company.id}`;
        await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);
        return twimlResponse(
          say(afterHoursScript) +
          say("Please leave your message after the tone.") +
          record({ action: voicemailAction, maxLength: 120, transcribe: config.transcribe_calls !== false }) +
          say("We did not receive your message. Goodbye.")
        );
      }
    }

    // Business hours - AI receptionist flow
    console.log("[twilio-voice-inbound] Business hours - starting AI flow");
    const conversationAction = `${functionsBase}/twilio-voice-conversation?call_id=${callLogId}&company_id=${company.id}`;

    // Build greeting with optional disclosure
    const greetingTwiml = disclosureRequired 
      ? say(greetingScript) + say(disclosureScript)
      : say(greetingScript);

    await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);

    return twimlResponse(
      gather({
        action: conversationAction,
        input: "speech",
        timeout: 5,
        speechTimeout: "auto",
        hints: "booking, appointment, schedule, quote, question, help, speak to someone, transfer",
        innerTwiml: greetingTwiml,
      }) +
      `<Redirect>${conversationAction}</Redirect>`
    );
  } catch (error) {
    console.error("[twilio-voice-inbound] Unexpected error:", error);
    if (companyId) {
      await recordMetric(supabase, companyId, "twilio-voice-inbound", false, Date.now() - startTime, String(error));
    }
    return twimlResponse(
      say("We're sorry, but we're experiencing technical difficulties. Please try again later.") +
      `<Hangup />`
    );
  }
});
