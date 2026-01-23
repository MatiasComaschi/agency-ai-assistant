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

// Audit logging for debug mode
// deno-lint-ignore no-explicit-any
async function logAudit(
  supabase: any,
  companyId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const systemUserId = "00000000-0000-0000-0000-000000000000";
    
    await supabase.from("audits").insert({
      actor_user_id: systemUserId,
      company_id: companyId || "00000000-0000-0000-0000-000000000000",
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  } catch (err) {
    console.error("[audit] Error logging:", err);
  }
}

// Phone number normalization to E.164 format
function normalizeToE164(phone: string): { valid: boolean; normalized: string } {
  if (!phone) return { valid: false, normalized: "" };
  
  let normalized = phone.replace(/[^\d+]/g, "");
  
  if (!normalized.startsWith("+")) {
    const digits = normalized.replace(/\D/g, "");
    if (digits.length === 10) {
      normalized = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      normalized = `+${digits}`;
    } else {
      normalized = `+${digits}`;
    }
  }
  
  const valid = /^\+[1-9]\d{6,14}$/.test(normalized);
  return { valid, normalized: valid ? normalized : phone };
}

function sanitizeString(input: string, maxLength = 1000): string {
  if (!input) return "";
  return input.trim().substring(0, maxLength).replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// CORS headers for browser requests (used for OPTIONS preflight only)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// XML escape function - MUST be called on all dynamic text
function escapeXml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Build valid TwiML response - ALWAYS returns text/xml
function buildTwimlResponse(body: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

// Error TwiML - fallback for any failure
function buildErrorTwiml(): Response {
  return buildTwimlResponse(
    `<Say voice="Polly.Joanna">Sorry, we're having trouble right now. Please try again later.</Say><Hangup />`
  );
}

// TwiML builder helpers
function say(text: string, voice = "Polly.Joanna"): string {
  return `<Say voice="${voice}">${escapeXml(text)}</Say>`;
}

function gather(options: {
  action: string;
  input?: string;
  timeout?: number;
  speechTimeout?: string;
  hints?: string;
  innerTwiml?: string;
}): string {
  const attrs = [
    `action="${escapeXml(options.action)}"`,
    `input="${options.input || "speech"}"`,
    `timeout="${options.timeout || 3}"`,
    `speechTimeout="${options.speechTimeout || "auto"}"`,
  ];
  if (options.hints) attrs.push(`hints="${escapeXml(options.hints)}"`);
  return `<Gather ${attrs.join(" ")}>${options.innerTwiml || ""}</Gather>`;
}

function dial(number: string, options?: { record?: boolean; action?: string }): string {
  const attrs: string[] = [];
  if (options?.record) attrs.push('record="record-from-answer-dual"');
  if (options?.action) attrs.push(`action="${escapeXml(options.action)}"`);
  return `<Dial ${attrs.join(" ")}>${escapeXml(number)}</Dial>`;
}

function record(options: { action: string; maxLength?: number; transcribe?: boolean }): string {
  const attrs = [`action="${escapeXml(options.action)}"`, `maxLength="${options.maxLength || 120}"`];
  if (options.transcribe) {
    attrs.push(`transcribe="true"`);
    attrs.push(`transcribeCallback="${escapeXml(options.action)}"`);
  }
  return `<Record ${attrs.join(" ")} />`;
}

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

// Parse Twilio form data from request
async function parseTwilioParams(req: Request): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Standard Twilio POST - form-urlencoded
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        params[key] = value.toString();
      }
    } else if (contentType.includes("application/json")) {
      // JSON for internal test calls only
      const json = await req.json();
      for (const key in json) {
        params[key] = String(json[key]);
      }
    } else {
      // Fallback: try to parse as form-urlencoded text
      const text = await req.text();
      if (text) {
        const urlParams = new URLSearchParams(text);
        for (const [key, value] of urlParams.entries()) {
          params[key] = value;
        }
      }
    }
  } catch (err) {
    console.error("[twilio-voice-inbound] Error parsing request body:", err);
  }

  return params;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  
  // Initialize Supabase client
  let supabase;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[twilio-voice-inbound] Missing Supabase credentials");
      return buildErrorTwiml();
    }
    
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  } catch (err) {
    console.error("[twilio-voice-inbound] Failed to create Supabase client:", err);
    return buildErrorTwiml();
  }

  let companyId: string | null = null;
  let debugMode = false;
  let rawParams: Record<string, string> = {};

  // MASTER try/catch - ensures we ALWAYS return valid TwiML
  try {
    // Parse the request body
    rawParams = await parseTwilioParams(req);

    console.log("[twilio-voice-inbound] ====== INCOMING CALL ======");
    console.log("[twilio-voice-inbound] Raw params:", JSON.stringify(rawParams, null, 2));

    // Extract and normalize phone numbers
    const calledResult = normalizeToE164(rawParams.Called || rawParams.To || "");
    const callerResult = normalizeToE164(rawParams.From || rawParams.Caller || "");
    const calledNumber = calledResult.normalized;
    const callerNumber = callerResult.normalized;
    
    // Extract CallSid - critical for action URLs
    const rawCallSid = rawParams.CallSid || "";
    const twilioCallSid = rawCallSid ? sanitizeString(rawCallSid, 50) : "MISSING_CALLSID";
    
    console.log("[twilio-voice-inbound] Extracted:", { 
      calledNumber, 
      callerNumber, 
      twilioCallSid,
      calledValid: calledResult.valid,
      callerValid: callerResult.valid,
    });

    // Validate called number
    if (!calledNumber || !calledResult.valid) {
      console.error("[twilio-voice-inbound] FAILURE: Invalid Called number:", rawParams.Called || rawParams.To);
      
      await logAudit(supabase, null, "inbound_call", "twilio_webhook", null, {
        status: "error",
        reason: "invalid_called_number",
        called_number: rawParams.Called || rawParams.To || "missing",
        caller_number: callerNumber,
        call_sid: twilioCallSid,
      });
      
      return buildTwimlResponse(say("We're sorry, but we cannot process your call at this time. Please try again later."));
    }

    // Rate limiting by caller number
    const rateLimit = await checkRateLimit(supabase, callerNumber || "unknown", "twilio-voice-inbound", 30, 60);
    if (!rateLimit.allowed) {
      console.warn("[twilio-voice-inbound] Rate limit exceeded for:", callerNumber);
      
      await logAudit(supabase, null, "inbound_call", "twilio_webhook", null, {
        status: "rate_limited",
        caller_number: callerNumber,
        called_number: calledNumber,
      });
      
      return buildTwimlResponse(say("You have made too many calls. Please try again later."));
    }

    // Find company by twilio_number
    console.log("[twilio-voice-inbound] Querying companies for twilio_number:", calledNumber);
    
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, twilio_number, fallback_phone, timezone, ai_enabled")
      .eq("twilio_number", calledNumber)
      .single();

    if (companyError || !company) {
      console.error("[twilio-voice-inbound] FAILURE: Company not found for:", calledNumber);
      
      await logAudit(supabase, null, "inbound_call", "twilio_webhook", null, {
        status: "no_match",
        reason: "company_not_found",
        called_number: calledNumber,
        caller_number: callerNumber,
        call_sid: twilioCallSid,
        error: companyError?.message || "No company found",
      });

      return buildTwimlResponse(say("This number is not configured yet. Please contact support to complete your setup."));
    }

    companyId = company.id;
    console.log("[twilio-voice-inbound] SUCCESS: Found company:", company.name, "(", company.id, ")");

    // Get integration config for debug mode and recording settings
    const { data: integration } = await supabase
      .from("integrations")
      .select("config_json, status")
      .eq("company_id", company.id)
      .eq("provider", "twilio")
      .single();

    const config = (integration?.config_json as Record<string, unknown>) || {};
    debugMode = config.debug_mode === true;
    const recordCalls = config.record_calls !== false;
    const afterHoursAction = (config.after_hours_action as string) || "voicemail";

    console.log("[twilio-voice-inbound] Config:", { debugMode, recordCalls, afterHoursAction });

    // Log matched company to audits
    await logAudit(supabase, company.id, "inbound_call", "twilio_webhook", twilioCallSid, {
      status: "matched_company",
      called_number: calledNumber,
      caller_number: callerNumber,
      company_name: company.name,
      twilio_call_sid: twilioCallSid,
      debug_mode: debugMode,
      ...(debugMode ? { raw_payload: rawParams } : {}),
    });

    // Build base URL for action callbacks
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const functionsBase = `${supabaseUrl}/functions/v1`;

    // PANIC SWITCH: Check if AI is enabled
    if (company.ai_enabled === false) {
      console.log("[twilio-voice-inbound] AI disabled (panic switch) - forwarding to fallback");
      
      const { data: callLog } = await supabase
        .from("calls")
        .insert({
          company_id: company.id,
          caller_number: callerNumber,
          started_at: new Date().toISOString(),
          outcome: "ai_disabled",
          extracted_json: { call_sid: twilioCallSid, ai_disabled: true },
        })
        .select()
        .single();

      await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);

      const callIdParam = encodeURIComponent(callLog?.id || twilioCallSid);
      const companyIdParam = encodeURIComponent(company.id);

      let twiml: string;
      if (company.fallback_phone) {
        const dialAction = `${functionsBase}/twilio-voice-dial-complete?call_id=${callIdParam}&company_id=${companyIdParam}`;
        twiml = say("Please hold while we connect you with a team member.") +
          dial(company.fallback_phone, { record: recordCalls, action: dialAction });
      } else {
        const voicemailAction = `${functionsBase}/twilio-voice-voicemail?call_id=${callIdParam}&company_id=${companyIdParam}`;
        twiml = say("We are currently unavailable. Please leave a message after the tone.") +
          record({ action: voicemailAction, maxLength: 120, transcribe: true });
      }
      
      if (debugMode) {
        await logAudit(supabase, company.id, "twiml_response", "twilio_webhook", twilioCallSid, {
          outcome: "ai_disabled",
          call_id_param: callIdParam,
          twiml_response: twiml,
        });
      }
      
      return buildTwimlResponse(twiml);
    }

    // Check subscription status
    const subscriptionStatus = await checkSubscriptionStatus(supabase, company.id);
    console.log("[twilio-voice-inbound] Subscription:", subscriptionStatus);

    // Get AI profile
    const { data: aiProfile, error: aiProfileError } = await supabase
      .from("ai_profiles")
      .select("*")
      .eq("company_id", company.id)
      .single();

    if (aiProfileError) {
      console.warn("[twilio-voice-inbound] AI profile not found, using defaults");
    }

    console.log("[twilio-voice-inbound] AI Profile:", {
      hasProfile: !!aiProfile,
      disclosureRequired: aiProfile?.disclosure_required !== false,
    });

    // Get business hours and holidays
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
          call_sid: twilioCallSid,
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

    // Build action URL parameters
    const callIdForUrls = encodeURIComponent(callLog?.id || twilioCallSid);
    const companyIdForUrls = encodeURIComponent(company.id);

    // Get scripts from AI profile
    const greetingScript = aiProfile?.greeting_script || "Hello! Thank you for calling. How may I help you today?";
    const disclosureScript = aiProfile?.disclosure_script || "Please note that you are speaking with an AI assistant.";
    const afterHoursScript = aiProfile?.after_hours_script || "We are currently closed. Please leave a message after the tone and we will get back to you as soon as possible.";
    const disclosureRequired = aiProfile?.disclosure_required !== false;

    // Handle inactive subscription
    if (!subscriptionStatus.isActive) {
      console.log("[twilio-voice-inbound] Subscription inactive - using fallback");
      if (callLog) {
        await supabase.from("calls").update({ outcome: "subscription_inactive" }).eq("id", callLog.id);
      }
      
      const inactiveMessage = "Thank you for calling. We're currently unable to connect you with our AI assistant. ";
      
      let twiml: string;
      if (company.fallback_phone) {
        const dialAction = `${functionsBase}/twilio-voice-dial-complete?call_id=${callIdForUrls}&company_id=${companyIdForUrls}`;
        twiml = say(inactiveMessage + "Please hold while we connect you with a team member.") +
          dial(company.fallback_phone, { record: recordCalls, action: dialAction });
      } else {
        const voicemailAction = `${functionsBase}/twilio-voice-voicemail?call_id=${callIdForUrls}&company_id=${companyIdForUrls}`;
        twiml = say(inactiveMessage + "Please leave your name, number, and a brief message after the tone.") +
          record({ action: voicemailAction, maxLength: 120, transcribe: config.transcribe_calls !== false }) +
          say("We did not receive your message. Goodbye.");
      }
      
      await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);
      
      if (debugMode) {
        await logAudit(supabase, company.id, "twiml_response", "twilio_webhook", twilioCallSid, {
          outcome: "subscription_inactive",
          call_id_param: callIdForUrls,
          twiml_response: twiml,
        });
      }
      
      return buildTwimlResponse(twiml);
    }

    // Increment usage counter
    await incrementUsage(supabase, company.id);

    // Check business hours
    const isHolidayToday = holidays ? isHoliday(holidays, company.timezone) : false;
    const isBusinessHours = hours && hours.length > 0 ? isWithinBusinessHours(hours, company.timezone) : true;
    const isOpen = !isHolidayToday && isBusinessHours;

    console.log("[twilio-voice-inbound] Routing:", { isHolidayToday, isBusinessHours, isOpen, afterHoursAction });

    // After hours handling
    if (!isOpen) {
      console.log("[twilio-voice-inbound] After hours - action:", afterHoursAction);
      if (callLog) {
        await supabase.from("calls").update({ outcome: "after_hours" }).eq("id", callLog.id);
      }
      
      let twiml: string;
      if (afterHoursAction === "forward" && company.fallback_phone) {
        const dialAction = `${functionsBase}/twilio-voice-dial-complete?call_id=${callIdForUrls}&company_id=${companyIdForUrls}`;
        twiml = say(afterHoursScript) + dial(company.fallback_phone, { record: recordCalls, action: dialAction });
      } else {
        const voicemailAction = `${functionsBase}/twilio-voice-voicemail?call_id=${callIdForUrls}&company_id=${companyIdForUrls}`;
        twiml = say(afterHoursScript) +
          say("Please leave your message after the tone.") +
          record({ action: voicemailAction, maxLength: 120, transcribe: config.transcribe_calls !== false }) +
          say("We did not receive your message. Goodbye.");
      }
      
      await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);
      
      if (debugMode) {
        await logAudit(supabase, company.id, "twiml_response", "twilio_webhook", twilioCallSid, {
          outcome: "after_hours",
          action: afterHoursAction,
          call_id_param: callIdForUrls,
          twiml_response: twiml,
        });
      }
      
      return buildTwimlResponse(twiml);
    }

    // Business hours - AI receptionist flow
    console.log("[twilio-voice-inbound] Business hours - starting AI flow");
    const conversationAction = `${functionsBase}/twilio-voice-conversation?call_id=${callIdForUrls}&company_id=${companyIdForUrls}&turn=1`;

    // Build greeting with optional disclosure
    const greetingTwiml = disclosureRequired 
      ? say(greetingScript) + say(disclosureScript)
      : say(greetingScript);

    const twiml = gather({
      action: conversationAction,
      input: "speech",
      timeout: 5,
      speechTimeout: "auto",
      hints: "booking, appointment, schedule, quote, question, help, speak to someone, transfer",
      innerTwiml: greetingTwiml,
    }) + `<Redirect>${escapeXml(conversationAction)}</Redirect>`;

    await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);

    // Always log routing decision
    await logAudit(supabase, company.id, "inbound_routing", "twilio_webhook", twilioCallSid, {
      routing_decision: "ai_conversation",
      routing_reason: "business_hours_ai_enabled",
      greeting_script: greetingScript,
      disclosure_required: disclosureRequired,
      call_id_param: callIdForUrls,
      conversation_action: conversationAction,
      ...(debugMode ? { twiml_response: twiml } : {}),
    });

    console.log("[twilio-voice-inbound] ====== CALL ROUTED TO AI ======");
    return buildTwimlResponse(twiml);
    
  } catch (error) {
    // CRITICAL: Catch-all error handler - MUST return valid TwiML
    console.error("[twilio-voice-inbound] ====== UNEXPECTED ERROR ======");
    console.error("[twilio-voice-inbound] Error:", error);
    console.error("[twilio-voice-inbound] Stack:", error instanceof Error ? error.stack : "no stack");
    console.error("[twilio-voice-inbound] Raw params:", rawParams);
    
    // Try to log the error (but don't fail if logging fails)
    try {
      await logAudit(supabase, companyId, "inbound_call", "twilio_webhook", null, {
        status: "error",
        error_message: error instanceof Error ? error.message : String(error),
        error_stack: debugMode && error instanceof Error ? error.stack : undefined,
        raw_payload: rawParams,
      });
      
      if (companyId) {
        await recordMetric(supabase, companyId, "twilio-voice-inbound", false, Date.now() - startTime, String(error));
      }
    } catch (logError) {
      console.error("[twilio-voice-inbound] Failed to log error:", logError);
    }
    
    // ALWAYS return valid TwiML - never blank, never JSON
    return buildErrorTwiml();
  }
});
