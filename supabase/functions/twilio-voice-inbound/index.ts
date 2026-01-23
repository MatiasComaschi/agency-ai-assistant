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
    // Use a system user ID for webhook-initiated audits
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
  let debugMode = false;
  let rawParams: Record<string, string> = {};

  try {
    // Parse form data from Twilio
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        rawParams[key] = value.toString();
      }
    } else if (contentType.includes("application/json")) {
      rawParams = await req.json();
    }

    // Log raw incoming request
    console.log("[twilio-voice-inbound] ====== INCOMING CALL ======");
    console.log("[twilio-voice-inbound] Raw params:", JSON.stringify(rawParams, null, 2));

    // Normalize phone numbers to E.164 BEFORE any database queries
    const calledResult = normalizeToE164(rawParams.Called || rawParams.To || "");
    const callerResult = normalizeToE164(rawParams.From || rawParams.Caller || "");
    const calledNumber = calledResult.normalized;
    const callerNumber = callerResult.normalized;
    const callSid = sanitizeString(rawParams.CallSid || "", 50);

    console.log("[twilio-voice-inbound] Normalized numbers:", { 
      calledNumber, 
      callerNumber, 
      callSid,
      calledValid: calledResult.valid,
      callerValid: callerResult.valid,
      rawCalled: rawParams.Called || rawParams.To,
      rawFrom: rawParams.From || rawParams.Caller,
    });

    // Validate called number
    if (!calledNumber || !calledResult.valid) {
      console.error("[twilio-voice-inbound] FAILURE: Invalid or missing Called number");
      console.error("[twilio-voice-inbound] Raw Called:", rawParams.Called);
      console.error("[twilio-voice-inbound] Raw To:", rawParams.To);
      
      // Log to audits as unmatched call
      await logAudit(supabase, null, "inbound_call", "twilio_webhook", null, {
        status: "error",
        reason: "invalid_called_number",
        called_number: rawParams.Called || rawParams.To || "missing",
        caller_number: callerNumber,
        call_sid: callSid,
      });
      
      const errorTwiml = say("We're sorry, but we cannot process your call at this time. Please try again later.");
      return twimlResponse(errorTwiml);
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
      
      return twimlResponse(say("You have made too many calls. Please try again later."));
    }

    // Identify company by twilio_number (using normalized E.164 format)
    console.log("[twilio-voice-inbound] Querying companies for twilio_number:", calledNumber);
    
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, twilio_number, fallback_phone, timezone, ai_enabled")
      .eq("twilio_number", calledNumber)
      .single();

    if (companyError || !company) {
      console.error("[twilio-voice-inbound] FAILURE: Company not found");
      console.error("[twilio-voice-inbound] Searched for twilio_number:", calledNumber);
      console.error("[twilio-voice-inbound] Query error:", companyError);
      
      // Log to audits as no_match
      await logAudit(supabase, null, "inbound_call", "twilio_webhook", null, {
        status: "no_match",
        reason: "company_not_found",
        called_number: calledNumber,
        caller_number: callerNumber,
        call_sid: callSid,
        error: companyError?.message || "No company found",
      });

      const noMatchTwiml = say("This number is not configured yet. Please contact support to complete your setup.");
      return twimlResponse(noMatchTwiml);
    }

    companyId = company.id;
    console.log("[twilio-voice-inbound] SUCCESS: Found company");
    console.log("[twilio-voice-inbound] Company ID:", company.id);
    console.log("[twilio-voice-inbound] Company name:", company.name);
    console.log("[twilio-voice-inbound] Company twilio_number:", company.twilio_number);

    // Fetch Twilio integration config to check debug mode
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

    console.log("[twilio-voice-inbound] Config loaded:", {
      debugMode,
      recordCalls,
      afterHoursAction,
      integrationStatus: integration?.status,
    });

    // Log matched company to audits
    await logAudit(supabase, company.id, "inbound_call", "twilio_webhook", callSid, {
      status: "matched_company",
      called_number: calledNumber,
      caller_number: callerNumber,
      company_name: company.name,
      debug_mode: debugMode,
      ...(debugMode ? { raw_payload: rawParams } : {}),
    });

    // PANIC SWITCH: Check if AI is enabled
    if (company.ai_enabled === false) {
      console.log("[twilio-voice-inbound] AI disabled (panic switch) - forwarding to fallback");
      
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

      if (company.fallback_phone) {
        const twiml = say("Please hold while we connect you with a team member.") +
          dial(company.fallback_phone, {
            record: recordCalls,
            action: `${functionsBase}/twilio-voice-dial-complete?call_id=${callLog?.id || ""}&company_id=${company.id}`,
          });
        
        if (debugMode) {
          await logAudit(supabase, company.id, "twiml_response", "twilio_webhook", callSid, {
            outcome: "ai_disabled_forward",
            twiml_response: twiml,
          });
        }
        
        return twimlResponse(twiml);
      } else {
        const twiml = say("We are currently unavailable. Please leave a message after the tone.") +
          record({ action: `${functionsBase}/twilio-voice-voicemail?call_id=${callLog?.id || ""}&company_id=${company.id}`, maxLength: 120, transcribe: true });
        
        if (debugMode) {
          await logAudit(supabase, company.id, "twiml_response", "twilio_webhook", callSid, {
            outcome: "ai_disabled_voicemail",
            twiml_response: twiml,
          });
        }
        
        return twimlResponse(twiml);
      }
    }

    // Check subscription status
    const subscriptionStatus = await checkSubscriptionStatus(supabase, company.id);
    console.log("[twilio-voice-inbound] Subscription status:", subscriptionStatus);

    // Fetch AI profile for scripts and disclosure settings
    const { data: aiProfile, error: aiProfileError } = await supabase
      .from("ai_profiles")
      .select("*")
      .eq("company_id", company.id)
      .single();

    if (aiProfileError) {
      console.warn("[twilio-voice-inbound] AI profile not found, using defaults:", aiProfileError.message);
    }

    console.log("[twilio-voice-inbound] AI Profile loaded:", {
      hasProfile: !!aiProfile,
      greeting: aiProfile?.greeting_script?.substring(0, 50) + "...",
      disclosureRequired: aiProfile?.disclosure_required !== false,
      tone: aiProfile?.tone,
      voiceId: aiProfile?.voice_id,
    });

    // Fetch business hours and holidays
    const { data: hours } = await supabase.from("company_hours").select("*").eq("company_id", company.id);
    const { data: holidays } = await supabase.from("company_holidays").select("*").eq("company_id", company.id);

    console.log("[twilio-voice-inbound] Business hours loaded:", {
      hoursCount: hours?.length || 0,
      holidaysCount: holidays?.length || 0,
      timezone: company.timezone,
    });

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
      
      let twiml: string;
      if (company.fallback_phone) {
        twiml = say(inactiveMessage + "Please hold while we connect you with a team member.") +
          dial(company.fallback_phone, { record: recordCalls, action: `${functionsBase}/twilio-voice-dial-complete?call_id=${callLogId}&company_id=${company.id}` });
      } else {
        const voicemailAction = `${functionsBase}/twilio-voice-voicemail?call_id=${callLogId}&company_id=${company.id}`;
        twiml = say(inactiveMessage + "Please leave your name, number, and a brief message after the tone.") +
          record({ action: voicemailAction, maxLength: 120, transcribe: config.transcribe_calls !== false }) +
          say("We did not receive your message. Goodbye.");
      }
      
      await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);
      
      if (debugMode) {
        await logAudit(supabase, company.id, "twiml_response", "twilio_webhook", callSid, {
          outcome: "subscription_inactive",
          twiml_response: twiml,
        });
      }
      
      return twimlResponse(twiml);
    }

    // Increment usage counter for active subscription
    await incrementUsage(supabase, company.id);

    // Check business hours (per-company allowed_hours enforcement)
    const isHolidayToday = holidays ? isHoliday(holidays, company.timezone) : false;
    const isBusinessHours = hours && hours.length > 0 ? isWithinBusinessHours(hours, company.timezone) : true;
    const isOpen = !isHolidayToday && isBusinessHours;

    console.log("[twilio-voice-inbound] Routing decision:", { 
      isHolidayToday, 
      isBusinessHours, 
      isOpen, 
      afterHoursAction,
      timezone: company.timezone,
    });

    // Route based on business hours
    if (!isOpen) {
      console.log("[twilio-voice-inbound] After hours - action:", afterHoursAction);
      if (callLog) {
        await supabase.from("calls").update({ outcome: "after_hours" }).eq("id", callLog.id);
      }
      
      let twiml: string;
      if (afterHoursAction === "forward" && company.fallback_phone) {
        twiml = say(afterHoursScript) + dial(company.fallback_phone, { record: recordCalls });
      } else {
        const voicemailAction = `${functionsBase}/twilio-voice-voicemail?call_id=${callLogId}&company_id=${company.id}`;
        twiml = say(afterHoursScript) +
          say("Please leave your message after the tone.") +
          record({ action: voicemailAction, maxLength: 120, transcribe: config.transcribe_calls !== false }) +
          say("We did not receive your message. Goodbye.");
      }
      
      await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);
      
      if (debugMode) {
        await logAudit(supabase, company.id, "twiml_response", "twilio_webhook", callSid, {
          outcome: "after_hours",
          action: afterHoursAction,
          twiml_response: twiml,
        });
      }
      
      return twimlResponse(twiml);
    }

    // Business hours - AI receptionist flow
    console.log("[twilio-voice-inbound] Business hours - starting AI flow");
    const conversationAction = `${functionsBase}/twilio-voice-conversation?call_id=${callLogId}&company_id=${company.id}`;

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
    }) + `<Redirect>${conversationAction}</Redirect>`;

    await recordMetric(supabase, company.id, "twilio-voice-inbound", true, Date.now() - startTime);

    if (debugMode) {
      await logAudit(supabase, company.id, "twiml_response", "twilio_webhook", callSid, {
        outcome: "ai_receptionist",
        greeting_script: greetingScript,
        disclosure_required: disclosureRequired,
        twiml_response: twiml,
      });
    }

    console.log("[twilio-voice-inbound] ====== CALL ROUTED TO AI ======");
    return twimlResponse(twiml);
    
  } catch (error) {
    console.error("[twilio-voice-inbound] ====== UNEXPECTED ERROR ======");
    console.error("[twilio-voice-inbound] Error:", error);
    console.error("[twilio-voice-inbound] Raw params:", rawParams);
    
    // Log error to audits
    await logAudit(supabase, companyId, "inbound_call", "twilio_webhook", null, {
      status: "error",
      error_message: error instanceof Error ? error.message : String(error),
      raw_payload: rawParams,
    });
    
    if (companyId) {
      await recordMetric(supabase, companyId, "twilio-voice-inbound", false, Date.now() - startTime, String(error));
    }
    
    // Always return valid TwiML, never blank
    const errorTwiml = say("We're sorry, but we're experiencing technical difficulties. Please try again later.") +
      `<Hangup />`;
    
    return twimlResponse(errorTwiml);
  }
});
