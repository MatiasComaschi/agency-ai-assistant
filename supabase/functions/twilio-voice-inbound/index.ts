import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

// TwiML helper functions
const twimlResponse = (body: string): Response => {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    {
      headers: { "Content-Type": "application/xml" },
    }
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
  if (options.hints) {
    attrs.push(`hints="${options.hints}"`);
  }
  return `<Gather ${attrs.join(" ")}>${options.innerTwiml || ""}</Gather>`;
};

const dial = (number: string, options?: { record?: boolean; action?: string }): string => {
  const attrs: string[] = [];
  if (options?.record) {
    attrs.push('record="record-from-answer-dual"');
  }
  if (options?.action) {
    attrs.push(`action="${options.action}"`);
  }
  return `<Dial ${attrs.join(" ")}>${number}</Dial>`;
};

const record = (options: {
  action: string;
  maxLength?: number;
  transcribe?: boolean;
}): string => {
  const attrs = [
    `action="${options.action}"`,
    `maxLength="${options.maxLength || 120}"`,
  ];
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
    
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dayOfWeek = dayMap[weekdayName];
    const currentTime = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    
    const todayHours = hours.find((h) => h.day_of_week === dayOfWeek);
    
    if (!todayHours || todayHours.is_closed) {
      return false;
    }
    
    return currentTime >= todayHours.open_time && currentTime <= todayHours.close_time;
  } catch (error) {
    console.error("[twilio-voice-inbound] Error checking business hours:", error);
    return true; // Default to business hours if error
  }
};

// Check if today is a holiday
const isHoliday = (
  holidays: Array<{ date: string; is_closed: boolean }>,
  timezone: string
): boolean => {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = formatter.format(now);
    
    return holidays.some((h) => h.date === todayStr && h.is_closed);
  } catch (error) {
    console.error("[twilio-voice-inbound] Error checking holidays:", error);
    return false;
  }
};

// Check if subscription is active
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

const checkSubscriptionStatus = async (
  supabase: any,
  companyId: string
): Promise<SubscriptionStatus> => {
  try {
    // Check subscription table
    const { data } = await supabase
      .from("subscriptions")
      .select("status, plan, calls_limit, minutes_limit, current_period_end")
      .eq("company_id", companyId)
      .single();

    const subscription = data as SubscriptionRecord | null;

    if (!subscription || subscription.status !== "active") {
      return {
        isActive: false,
        plan: null,
        callsLimit: 0,
        minutesLimit: 0,
        callsUsed: 0,
        minutesUsed: 0,
      };
    }

    // Check if subscription period is current
    const now = new Date();
    const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
    
    if (periodEnd && now > periodEnd) {
      return {
        isActive: false,
        plan: subscription.plan,
        callsLimit: subscription.calls_limit,
        minutesLimit: subscription.minutes_limit,
        callsUsed: 0,
        minutesUsed: 0,
      };
    }

    // Get current month's usage
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
    // Default to active to prevent blocking legitimate calls due to errors
    return {
      isActive: true,
      plan: null,
      callsLimit: 100,
      minutesLimit: 200,
      callsUsed: 0,
      minutesUsed: 0,
    };
  }
};

// Increment usage counters
const incrementUsage = async (
  supabase: any,
  companyId: string
): Promise<void> => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    
    // Try to update existing usage record
    const { data } = await supabase
      .from("usage")
      .select("id, calls_count")
      .eq("company_id", companyId)
      .eq("month", currentMonth)
      .single();

    const existing = data as UsageRecord | null;

    if (existing) {
      await supabase
        .from("usage")
        .update({ calls_count: existing.calls_count + 1 })
        .eq("id", existing.id);
    } else {
      // Create new usage record for this month
      await supabase
        .from("usage")
        .insert({
          company_id: companyId,
          month: currentMonth,
          calls_count: 1,
          minutes_count: 0,
          overage_cents: 0,
        });
    }
  } catch (error) {
    console.error("[twilio-voice-inbound] Error incrementing usage:", error);
  }
};

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse form data from Twilio (application/x-www-form-urlencoded)
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

    console.log("[twilio-voice-inbound] Incoming call params:", JSON.stringify(params));

    // Validate required Twilio params
    const calledNumber = params.Called || params.To;
    const callerNumber = params.From || params.Caller;
    const callSid = params.CallSid;

    if (!calledNumber) {
      console.error("[twilio-voice-inbound] Missing Called number");
      return twimlResponse(
        say("We're sorry, but we cannot process your call at this time. Please try again later.")
      );
    }

    // Identify company by twilio_number
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, twilio_number, fallback_phone, timezone")
      .eq("twilio_number", calledNumber)
      .single();

    if (companyError || !company) {
      console.error("[twilio-voice-inbound] Company not found for number:", calledNumber, companyError);
      return twimlResponse(
        say("We're sorry, but this number is not configured. Please contact support.")
      );
    }

    console.log("[twilio-voice-inbound] Found company:", company.name, company.id);

    // Check subscription status
    const subscriptionStatus = await checkSubscriptionStatus(supabase, company.id);
    console.log("[twilio-voice-inbound] Subscription status:", subscriptionStatus);

    // Fetch AI profile for scripts
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
    const { data: hours } = await supabase
      .from("company_hours")
      .select("*")
      .eq("company_id", company.id);

    const { data: holidays } = await supabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", company.id);

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

    // Build webhook URLs
    const baseUrl = supabaseUrl.replace("/rest/v1", "");
    const functionsBase = `${baseUrl}/functions/v1`;
    const callLogId = callLog?.id || "";

    // Handle inactive subscription - fallback to voicemail or forward
    if (!subscriptionStatus.isActive) {
      console.log("[twilio-voice-inbound] Subscription inactive - using fallback");

      // Update call log with outcome
      if (callLog) {
        await supabase
          .from("calls")
          .update({ outcome: "subscription_inactive" })
          .eq("id", callLog.id);
      }

      const inactiveMessage = "Thank you for calling. We're currently unable to connect you with our AI assistant. ";
      
      if (company.fallback_phone) {
        // Forward to fallback phone
        return twimlResponse(
          say(inactiveMessage + "Please hold while we connect you with a team member.") +
          dial(company.fallback_phone, { 
            record: recordCalls,
            action: `${functionsBase}/twilio-voice-dial-complete?call_id=${callLogId}&company_id=${company.id}`,
          })
        );
      } else {
        // Take voicemail
        const voicemailAction = `${functionsBase}/twilio-voice-voicemail?call_id=${callLogId}&company_id=${company.id}`;
        return twimlResponse(
          say(inactiveMessage + "Please leave your name, number, and a brief message after the tone.") +
          record({
            action: voicemailAction,
            maxLength: 120,
            transcribe: config.transcribe_calls !== false,
          }) +
          say("We did not receive your message. Goodbye.")
        );
      }
    }

    // Increment usage counter for active subscription
    await incrementUsage(supabase, company.id);

    // Determine call routing for active subscriptions
    const isHolidayToday = holidays ? isHoliday(holidays, company.timezone) : false;
    const isBusinessHours = hours && hours.length > 0
      ? isWithinBusinessHours(hours, company.timezone)
      : true;
    const isOpen = !isHolidayToday && isBusinessHours;

    console.log("[twilio-voice-inbound] Routing decision:", {
      isHolidayToday,
      isBusinessHours,
      isOpen,
      afterHoursAction,
    });

    // Route based on business hours
    if (!isOpen) {
      // After hours handling
      console.log("[twilio-voice-inbound] After hours - action:", afterHoursAction);

      // Update call log with outcome
      if (callLog) {
        await supabase
          .from("calls")
          .update({ outcome: "after_hours" })
          .eq("id", callLog.id);
      }

      if (afterHoursAction === "forward" && company.fallback_phone) {
        // Forward to fallback phone
        return twimlResponse(
          say(afterHoursScript) +
          dial(company.fallback_phone, { record: recordCalls })
        );
      } else {
        // Play after-hours script and take voicemail
        const voicemailAction = `${functionsBase}/twilio-voice-voicemail?call_id=${callLogId}&company_id=${company.id}`;
        return twimlResponse(
          say(afterHoursScript) +
          say("Please leave your message after the tone.") +
          record({
            action: voicemailAction,
            maxLength: 120,
            transcribe: config.transcribe_calls !== false,
          }) +
          say("We did not receive your message. Goodbye.")
        );
      }
    }

    // Business hours - AI receptionist flow
    console.log("[twilio-voice-inbound] Business hours - starting AI flow");

    // Build conversation action URL
    const conversationAction = `${functionsBase}/twilio-voice-conversation?call_id=${callLogId}&company_id=${company.id}`;

    // Start with greeting + disclosure, then gather speech
    return twimlResponse(
      gather({
        action: conversationAction,
        input: "speech",
        timeout: 5,
        speechTimeout: "auto",
        hints: "booking, appointment, schedule, quote, question, help, speak to someone, transfer",
        innerTwiml: 
          say(greetingScript) + 
          say(disclosureScript),
      }) +
      // Fallback if no speech detected
      `<Redirect>${conversationAction}</Redirect>`
    );
  } catch (error) {
    console.error("[twilio-voice-inbound] Unexpected error:", error);
    return twimlResponse(
      say("We're sorry, but we encountered an error. Please try your call again later.")
    );
  }
});
