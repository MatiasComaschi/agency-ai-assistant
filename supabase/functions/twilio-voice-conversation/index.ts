import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

// CORS headers for preflight
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// XML escape - MUST be called on all dynamic text
const escapeXml = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

// Build valid TwiML response - ALWAYS returns text/xml
const buildTwimlResponse = (body: string): Response => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
};

// Error TwiML - fallback for any failure
const buildErrorTwiml = (): Response => {
  return buildTwimlResponse(
    `<Say voice="Polly.Joanna">Sorry, we're having trouble right now. Please try again later.</Say><Hangup />`
  );
};

// TwiML helper functions
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
    `action="${escapeXml(options.action)}"`,
    `input="${options.input || "speech"}"`,
    `timeout="${options.timeout || 3}"`,
    `speechTimeout="${options.speechTimeout || "auto"}"`,
  ];
  if (options.hints) {
    attrs.push(`hints="${escapeXml(options.hints)}"`);
  }
  return `<Gather ${attrs.join(" ")}>${options.innerTwiml || ""}</Gather>`;
};

// Audit logging
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
    console.error("[twilio-voice-conversation] Audit log error:", err);
  }
}

// Escalation triggers
const ESCALATION_KEYWORDS = [
  "speak to someone",
  "talk to a person",
  "human",
  "representative",
  "manager",
  "supervisor",
  "transfer",
  "real person",
  "operator",
  "agent",
];

const COMPLAINT_KEYWORDS = [
  "complaint",
  "complain",
  "angry",
  "frustrated",
  "unacceptable",
  "terrible",
  "awful",
  "horrible",
  "ridiculous",
  "sue",
  "lawyer",
  "attorney",
];

// Emergency keywords for after-hours forwarding
const EMERGENCY_KEYWORDS = [
  "emergency",
  "urgent",
  "no heat",
  "no hot water",
  "gas leak",
  "flood",
  "flooding",
  "water everywhere",
  "fire",
  "carbon monoxide",
  "broken pipe",
  "burst pipe",
  "sewage",
  "no power",
  "electrical fire",
];

// Booking intent keywords
const BOOKING_KEYWORDS = [
  "book",
  "appointment",
  "schedule",
  "available",
  "come in",
  "visit",
  "reserve",
  "slot",
  "opening",
  "availability",
];

// Greeting/small talk patterns
const GREETING_PATTERNS = [
  "hello",
  "hi",
  "hey",
  "good morning",
  "good afternoon",
  "good evening",
  "how are you",
  "how's it going",
  "what's up",
  "howdy",
];

const SMALL_TALK_PATTERNS = [
  "how are you",
  "how's it going",
  "how you doing",
  "what's up",
  "nice to talk",
  "thank you",
  "thanks",
  "appreciate",
];

const GOODBYE_PATTERNS = [
  "goodbye",
  "bye",
  "that's all",
  "that is all",
  "no thanks",
  "no thank you",
  "i'm good",
  "i'm all set",
  "all set",
  "nothing else",
  "have a nice day",
  "take care",
];

// Intent detection
type UserIntent = "greeting" | "small_talk" | "booking" | "question" | "escalation" | "goodbye" | "callback_request" | "emergency" | "unknown";

const detectIntent = (speech: string): UserIntent => {
  const lower = speech.toLowerCase();
  
  // Check for goodbye first
  for (const pattern of GOODBYE_PATTERNS) {
    if (lower.includes(pattern)) return "goodbye";
  }
  
  // Check for emergency
  for (const keyword of EMERGENCY_KEYWORDS) {
    if (lower.includes(keyword)) return "emergency";
  }
  
  // Check for escalation
  for (const keyword of ESCALATION_KEYWORDS) {
    if (lower.includes(keyword)) return "escalation";
  }
  
  // Check for booking
  for (const keyword of BOOKING_KEYWORDS) {
    if (lower.includes(keyword)) return "booking";
  }
  
  // Check for small talk (includes greetings with questions)
  for (const pattern of SMALL_TALK_PATTERNS) {
    if (lower.includes(pattern)) return "small_talk";
  }
  
  // Check for pure greeting (short utterances)
  if (speech.split(" ").length <= 4) {
    for (const pattern of GREETING_PATTERNS) {
      if (lower.includes(pattern)) return "greeting";
    }
  }
  
  return "question";
};

const generateGreetingResponse = (companyName: string, isAfterHours: boolean): string => {
  if (isAfterHours) {
    return `Hi there! We're currently closed, but I can still help with questions and take a message. What can I do for you?`;
  }
  const responses = [
    `Hi there! I'm doing great, thanks for asking. How can I help you today?`,
    `Hello! It's nice to hear from you. What can I do for you?`,
    `Hey! Thanks for calling ${companyName}. What can I help you with?`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
};

const generateSmallTalkResponse = (isAfterHours: boolean): string => {
  if (isAfterHours) {
    return `I appreciate that! We're currently closed, but I'm here to help. What do you need?`;
  }
  const responses = [
    `I'm doing well, thank you! Now, what can I help you with?`,
    `Thanks for asking! I'm here and ready to help. What do you need?`,
    `I appreciate that! So, what brings you in today?`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
};

const generateGoodbyeResponse = (): string => {
  const responses = [
    `Thank you for calling! Have a wonderful day.`,
    `Goodbye! Take care and feel free to call back anytime.`,
    `Thanks for reaching out. Have a great day!`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
};

// Industry-specific booking templates with natural flow
const INDUSTRY_BOOKING_TEMPLATES: Record<string, {
  questions: { prompt: string; field: string }[];
  keywords: string[];
  serviceName: string;
}> = {
  salon: {
    questions: [
      { prompt: "What service are you looking for? Like a haircut, color, or maybe something else?", field: "service" },
      { prompt: "What day works best for you?", field: "day" },
      { prompt: "And what time of day? Morning, afternoon, or evening?", field: "time" },
    ],
    keywords: ["haircut", "color", "styling", "treatment", "trim", "highlights", "perm", "blowout", "manicure", "pedicure"],
    serviceName: "salon appointment",
  },
  hvac: {
    questions: [
      { prompt: "What's the issue you're experiencing? AC not cooling, heating problem, or maintenance?", field: "service" },
      { prompt: "What day would work for a technician to come out?", field: "day" },
      { prompt: "Morning or afternoon work better for you?", field: "time" },
    ],
    keywords: ["ac", "air conditioning", "heating", "furnace", "maintenance", "repair", "install", "thermostat", "duct"],
    serviceName: "service appointment",
  },
  plumber: {
    questions: [
      { prompt: "What plumbing issue are you dealing with? A leak, clog, or something else?", field: "service" },
      { prompt: "What day works for you?", field: "day" },
      { prompt: "Prefer morning or afternoon?", field: "time" },
    ],
    keywords: ["leak", "clog", "drain", "pipe", "water heater", "toilet", "faucet", "sewer", "installation"],
    serviceName: "plumbing service",
  },
  default: {
    questions: [
      { prompt: "What service are you interested in?", field: "service" },
      { prompt: "What day works for you?", field: "day" },
      { prompt: "And what time? Morning, afternoon, or evening?", field: "time" },
    ],
    keywords: [],
    serviceName: "appointment",
  },
};

const shouldEscalate = (
  speechResult: string,
  escalationRules: Record<string, unknown>
): { escalate: boolean; reason: string } => {
  const lowerSpeech = speechResult.toLowerCase();

  // Check for explicit escalation request
  if (escalationRules.escalateOnRequest !== false) {
    for (const keyword of ESCALATION_KEYWORDS) {
      if (lowerSpeech.includes(keyword)) {
        return { escalate: true, reason: "caller_request" };
      }
    }
  }

  // Check for complaint language
  if (escalationRules.escalateOnComplaint !== false) {
    for (const keyword of COMPLAINT_KEYWORDS) {
      if (lowerSpeech.includes(keyword)) {
        return { escalate: true, reason: "complaint_detected" };
      }
    }
  }

  return { escalate: false, reason: "" };
};

const detectBookingIntent = (speechResult: string): boolean => {
  const lowerSpeech = speechResult.toLowerCase();
  return BOOKING_KEYWORDS.some((keyword) => lowerSpeech.includes(keyword));
};

const detectEmergency = (speechResult: string): boolean => {
  const lowerSpeech = speechResult.toLowerCase();
  return EMERGENCY_KEYWORDS.some((keyword) => lowerSpeech.includes(keyword));
};

const getBookingTemplate = (industry: string | null): typeof INDUSTRY_BOOKING_TEMPLATES.default => {
  const normalizedIndustry = (industry || "").toLowerCase();
  return INDUSTRY_BOOKING_TEMPLATES[normalizedIndustry] || INDUSTRY_BOOKING_TEMPLATES.default;
};

interface BookingFlowState {
  active: boolean;
  step: number;
  service?: string;
  day?: string;
  time?: string;
  phone_confirmed?: string;
  industry?: string;
}

interface CallbackFlowState {
  active: boolean;
  step: number;
  name?: string;
  callback_number?: string;
  reason?: string;
  urgency?: string;
}

interface ExtractedJson {
  booking_flow?: BookingFlowState;
  callback_flow?: CallbackFlowState;
  last_user_intent?: UserIntent;
  conversation_context?: string;
  is_after_hours?: boolean;
  [key: string]: unknown;
}

// Parse Twilio form data from request
async function parseTwilioParams(req: Request): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        params[key] = value.toString();
      }
    } else if (contentType.includes("application/json")) {
      const json = await req.json();
      for (const key in json) {
        params[key] = String(json[key]);
      }
    } else {
      const text = await req.text();
      if (text) {
        const urlParams = new URLSearchParams(text);
        for (const [key, value] of urlParams.entries()) {
          params[key] = value;
        }
      }
    }
  } catch (err) {
    console.error("[twilio-voice-conversation] Error parsing request body:", err);
  }

  return params;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Initialize Supabase
  let supabase;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[twilio-voice-conversation] Missing Supabase credentials");
      return buildErrorTwiml();
    }
    
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  } catch (err) {
    console.error("[twilio-voice-conversation] Failed to create Supabase client:", err);
    return buildErrorTwiml();
  }

  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

  // MASTER try/catch - ensures we ALWAYS return valid TwiML
  try {
    // Parse URL params
    const url = new URL(req.url);
    const callId = url.searchParams.get("call_id");
    const companyId = url.searchParams.get("company_id");
    const turnCount = parseInt(url.searchParams.get("turn") || "1", 10);
    const bookingStep = url.searchParams.get("booking_step");
    const callbackStep = url.searchParams.get("callback_step");

    // Parse form data from Twilio
    const params = await parseTwilioParams(req);

    const speechResult = params.SpeechResult || "";
    const confidence = parseFloat(params.Confidence || "0");
    const callerNumber = params.From || params.Caller || "";
    const callSid = params.CallSid || "";

    console.log("[twilio-voice-conversation] ====== CONVERSATION TURN ======");
    console.log("[twilio-voice-conversation] Processing:", {
      callId,
      companyId,
      turnCount,
      bookingStep,
      callbackStep,
      speechResult: speechResult.substring(0, 100),
      confidence,
      callSid,
    });

    if (!companyId) {
      console.error("[twilio-voice-conversation] Missing company_id");
      return buildTwimlResponse(
        say("We're sorry, but we cannot process your request. Goodbye.") +
        `<Hangup />`
      );
    }

    // Build base URLs
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const functionsBase = `${supabaseUrl}/functions/v1`;
    const escalateUrl = `${functionsBase}/twilio-voice-escalate?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}`;
    const nextTurnUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}`;

    // Fetch company and AI profile
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, fallback_phone, booking_link, industry")
      .eq("id", companyId)
      .single();

    const { data: aiProfile } = await supabase
      .from("ai_profiles")
      .select("*")
      .eq("company_id", companyId)
      .single();

    const escalationRules = (aiProfile?.escalation_rules_json as Record<string, unknown>) || {
      escalateOnRequest: true,
      escalateOnComplaint: true,
      escalateAfterMinutes: 5,
      emergencyForwardAfterHours: false, // Disabled by default
    };

    const allowedActions = (aiProfile?.allowed_actions_json as Record<string, boolean>) || {
      booking: true,
      faq: true,
      quote: false,
      escalate: true,
    };

    // Get current state from call record
    let bookingFlowState: BookingFlowState = { active: false, step: 0 };
    let callbackFlowState: CallbackFlowState = { active: false, step: 0 };
    let lastUserIntent: UserIntent = "unknown";
    let conversationContext = "";
    let isAfterHours = false;
    
    if (callId) {
      const { data: callData } = await supabase
        .from("calls")
        .select("extracted_json")
        .eq("id", callId)
        .single();
      
      const extractedJson = (callData?.extracted_json as ExtractedJson) || {};
      if (extractedJson.booking_flow) {
        bookingFlowState = extractedJson.booking_flow;
      }
      if (extractedJson.callback_flow) {
        callbackFlowState = extractedJson.callback_flow;
      }
      if (extractedJson.last_user_intent) {
        lastUserIntent = extractedJson.last_user_intent;
      }
      if (extractedJson.conversation_context) {
        conversationContext = extractedJson.conversation_context;
      }
      if (extractedJson.is_after_hours !== undefined) {
        isAfterHours = extractedJson.is_after_hours;
      }
    }

    console.log("[twilio-voice-conversation] Context:", { isAfterHours, lastUserIntent });

    // Detect current intent
    const currentIntent = speechResult ? detectIntent(speechResult) : "unknown";
    
    // Handle goodbye intent
    if (currentIntent === "goodbye") {
      const goodbyeMsg = generateGoodbyeResponse();
      
      await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
        turn: turnCount,
        last_user_utterance: speechResult.substring(0, 500),
        last_ai_response: goodbyeMsg,
        intent: "goodbye",
        is_after_hours: isAfterHours,
      });

      if (callId) {
        await supabase.from("calls").update({ 
          outcome: bookingFlowState.active ? "booked" : (callbackFlowState.active ? "callback_requested" : "resolved"),
          ended_at: new Date().toISOString(),
        }).eq("id", callId);
      }

      return buildTwimlResponse(say(goodbyeMsg) + `<Hangup />`);
    }

    // Handle emergency during after-hours (only if enabled)
    if (isAfterHours && currentIntent === "emergency" && escalationRules.emergencyForwardAfterHours === true && company?.fallback_phone) {
      console.log("[twilio-voice-conversation] Emergency detected after-hours - forwarding");
      
      await logAudit(supabase, companyId, "conversation_escalate", "twilio_conversation", callId, {
        turn: turnCount,
        escalation_reason: "emergency_after_hours",
        last_user_utterance: speechResult.substring(0, 500),
        is_after_hours: isAfterHours,
      });

      return buildTwimlResponse(
        say("I understand this is urgent. Let me connect you with someone right away.") +
        `<Redirect>${escapeXml(escalateUrl)}&amp;reason=emergency_after_hours</Redirect>`
      );
    }

    // Handle escalation request during after-hours - offer callback instead
    if (isAfterHours && currentIntent === "escalation") {
      console.log("[twilio-voice-conversation] Escalation requested after-hours - offering callback");
      
      // Start callback flow
      callbackFlowState = { active: true, step: 0 };
      
      if (callId) {
        const { data: existingCall } = await supabase
          .from("calls")
          .select("extracted_json")
          .eq("id", callId)
          .single();

        const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
        await supabase.from("calls").update({
          extracted_json: {
            ...existingJson,
            callback_flow: callbackFlowState,
            last_user_intent: "callback_request",
          },
        }).eq("id", callId);
      }

      const callbackUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&callback_step=1`;
      
      await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
        turn: turnCount,
        last_user_utterance: speechResult.substring(0, 500),
        last_ai_response: "Cannot transfer after hours - offering callback",
        intent: "escalation",
        is_after_hours: isAfterHours,
      });

      return buildTwimlResponse(
        gather({
          action: callbackUrl,
          input: "speech",
          timeout: 8,
          speechTimeout: "auto",
          innerTwiml: say("I can't connect you right now since we're closed, but I can create a callback request for the next business day. Can I get your name?"),
        }) +
        say("Sorry — I didn't quite hear that. Want to try again?") +
        `<Redirect method="POST">${escapeXml(callbackUrl)}</Redirect>`
      );
    }

    // Handle callback flow (for after-hours)
    if (callbackStep || callbackFlowState.active) {
      const currentStep = parseInt(callbackStep || "0", 10);
      
      // Store answer from previous step
      if (speechResult && currentStep > 0) {
        if (currentStep === 1) {
          callbackFlowState.name = speechResult;
        } else if (currentStep === 2) {
          // Phone confirmation
          const confirmed = speechResult.toLowerCase();
          if (confirmed.includes("yes") || confirmed.includes("correct") || confirmed.includes("right") || confirmed.includes("yeah")) {
            callbackFlowState.callback_number = callerNumber;
          } else {
            // Ask for correct number
            callbackFlowState.step = currentStep;
            
            if (callId) {
              const { data: existingCall } = await supabase
                .from("calls")
                .select("extracted_json")
                .eq("id", callId)
                .single();

              const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
              await supabase.from("calls").update({
                extracted_json: {
                  ...existingJson,
                  callback_flow: callbackFlowState,
                },
              }).eq("id", callId);
            }

            const phoneUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&callback_step=3`;
            
            return buildTwimlResponse(
              gather({
                action: phoneUrl,
                input: "dtmf speech",
                timeout: 10,
                speechTimeout: "auto",
                innerTwiml: say("No problem. What's the best number to reach you at?"),
              }) +
              say("Sorry — I didn't quite hear that. Want to try again?") +
              `<Redirect method="POST">${escapeXml(phoneUrl)}</Redirect>`
            );
          }
        } else if (currentStep === 3) {
          // Alternative phone number
          const digits = speechResult.replace(/\D/g, "");
          if (digits.length >= 10) {
            callbackFlowState.callback_number = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
          } else {
            callbackFlowState.callback_number = callerNumber;
          }
        } else if (currentStep === 4) {
          callbackFlowState.reason = speechResult;
        } else if (currentStep === 5) {
          // Urgency level
          const lower = speechResult.toLowerCase();
          if (lower.includes("urgent") || lower.includes("asap") || lower.includes("emergency") || lower.includes("soon")) {
            callbackFlowState.urgency = "high";
          } else if (lower.includes("whenever") || lower.includes("no rush") || lower.includes("not urgent")) {
            callbackFlowState.urgency = "low";
          } else {
            callbackFlowState.urgency = "normal";
          }
        }
      }

      callbackFlowState.step = currentStep;

      // Save state
      if (callId) {
        const { data: existingCall } = await supabase
          .from("calls")
          .select("extracted_json, transcript")
          .eq("id", callId)
          .single();

        const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
        const existingTranscript = existingCall?.transcript || "";

        await supabase.from("calls").update({
          transcript: existingTranscript + `\nCaller: ${speechResult}`,
          extracted_json: {
            ...existingJson,
            callback_flow: callbackFlowState,
            last_user_intent: "callback_request",
          },
        }).eq("id", callId);
      }

      // Step 1: Ask for name (already asked in escalation handling)
      if (currentStep === 0 || currentStep === 1) {
        // Got name, now confirm phone
        const formattedPhone = callerNumber.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
        const phoneConfirmUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&callback_step=2`;
        
        await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
          turn: turnCount,
          last_user_utterance: speechResult.substring(0, 500),
          callback_step: currentStep,
          is_after_hours: isAfterHours,
        });

        return buildTwimlResponse(
          gather({
            action: phoneConfirmUrl,
            input: "speech",
            timeout: 5,
            speechTimeout: "auto",
            hints: "yes, no, correct, wrong, yeah",
            innerTwiml: say(`Got it${callbackFlowState.name ? `, ${callbackFlowState.name}` : ""}. Should we call you back at ${formattedPhone}?`),
          }) +
          say("Sorry — I didn't quite hear that. Want to try again?") +
          `<Redirect method="POST">${escapeXml(phoneConfirmUrl)}</Redirect>`
        );
      }

      // Step 2-3: Phone confirmed, ask for reason
      if (currentStep === 2 || currentStep === 3) {
        const reasonUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&callback_step=4`;
        
        return buildTwimlResponse(
          gather({
            action: reasonUrl,
            input: "speech",
            timeout: 10,
            speechTimeout: "auto",
            innerTwiml: say("Great. Briefly, what should we call you about?"),
          }) +
          say("Sorry — I didn't quite hear that. Want to try again?") +
          `<Redirect method="POST">${escapeXml(reasonUrl)}</Redirect>`
        );
      }

      // Step 4: Got reason, ask urgency
      if (currentStep === 4) {
        const urgencyUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&callback_step=5`;
        
        return buildTwimlResponse(
          gather({
            action: urgencyUrl,
            input: "speech",
            timeout: 5,
            speechTimeout: "auto",
            hints: "urgent, asap, no rush, whenever, normal",
            innerTwiml: say("Thanks. Is this urgent, or can it wait until normal business hours?"),
          }) +
          say("Sorry — I didn't quite hear that. Want to try again?") +
          `<Redirect method="POST">${escapeXml(urgencyUrl)}</Redirect>`
        );
      }

      // Step 5: Complete - create followup task
      if (currentStep === 5) {
        console.log("[twilio-voice-conversation] Creating callback followup task");
        
        const taskTitle = `After-hours callback requested${callbackFlowState.urgency === "high" ? " (URGENT)" : ""}`;
        const taskNotes = [
          `Caller: ${callbackFlowState.name || "Unknown"}`,
          `Callback number: ${callbackFlowState.callback_number || callerNumber}`,
          `Reason: ${callbackFlowState.reason || "Not specified"}`,
          `Urgency: ${callbackFlowState.urgency || "normal"}`,
          `Call ID: ${callId || callSid}`,
        ].join("\n");

        // Create followup task
        const { data: task, error: taskError } = await supabase.from("followup_tasks").insert({
          company_id: companyId,
          call_id: callId,
          title: taskTitle,
          notes: taskNotes,
          status: "open",
          due_at: callbackFlowState.urgency === "high" 
            ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours
            : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Next day
        }).select().single();

        if (taskError) {
          console.error("[twilio-voice-conversation] Error creating callback task:", taskError);
        } else {
          console.log("[twilio-voice-conversation] Created callback task:", task.id);
        }

        // Try to send SMS confirmation
        let smsSent = false;
        const phoneToSend = callbackFlowState.callback_number || callerNumber;
        
        try {
          const smsMessage = `Hi${callbackFlowState.name ? ` ${callbackFlowState.name}` : ""}! Your callback request has been received. ${company?.name || "We"} will call you back${callbackFlowState.urgency === "high" ? " as soon as possible" : " during the next business day"}. Thank you!`;
          
          const smsResponse = await fetch(`${functionsBase}/twilio-send-sms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              company_id: companyId,
              to_phone: phoneToSend,
              message: smsMessage,
              call_id: callId,
            }),
          });

          if (smsResponse.ok) {
            smsSent = true;
            console.log("[twilio-voice-conversation] Callback confirmation SMS sent");
          }
        } catch (smsError) {
          console.error("[twilio-voice-conversation] SMS error:", smsError);
        }

        // Update call outcome
        if (callId) {
          await supabase.from("calls").update({ 
            outcome: "callback_requested",
            extracted_json: {
              ...(await supabase.from("calls").select("extracted_json").eq("id", callId).single()).data?.extracted_json,
              callback_flow: callbackFlowState,
              callback_task_id: task?.id,
              sms_confirmation_sent: smsSent,
            },
          }).eq("id", callId);
        }

        const successMessage = smsSent 
          ? "Perfect! I've logged your callback request and sent you a text confirmation. Someone will reach out during the next business day. Is there anything else I can help with?"
          : "Perfect! I've logged your callback request. Someone will reach out during the next business day. Is there anything else I can help with?";

        await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
          turn: turnCount,
          last_user_utterance: speechResult.substring(0, 500),
          last_ai_response: successMessage,
          callback_completed: true,
          callback_task_id: task?.id,
          sms_sent: smsSent,
          is_after_hours: isAfterHours,
        });

        // Reset callback flow but stay in conversation
        callbackFlowState = { active: false, step: 0 };

        return buildTwimlResponse(
          gather({
            action: nextTurnUrl,
            input: "speech",
            timeout: 5,
            speechTimeout: "auto",
            innerTwiml: say(successMessage),
          }) +
          say("Thank you for calling. Have a great night!") +
          `<Hangup />`
        );
      }
    }

    // Check for escalation triggers (during business hours)
    if (!isAfterHours && speechResult) {
      const escalationCheck = shouldEscalate(speechResult, escalationRules);
      if (escalationCheck.escalate) {
        console.log("[twilio-voice-conversation] Escalating:", escalationCheck.reason);

        await logAudit(supabase, companyId, "conversation_escalate", "twilio_conversation", callId, {
          turn: turnCount,
          escalation_reason: escalationCheck.reason,
          last_user_utterance: speechResult.substring(0, 500),
          is_after_hours: isAfterHours,
        });

        if (callId) {
          const { data: existingCall } = await supabase
            .from("calls")
            .select("extracted_json, transcript")
            .eq("id", callId)
            .single();

          const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
          const existingTranscript = existingCall?.transcript || "";

          await supabase
            .from("calls")
            .update({
              transcript: existingTranscript + `\nCaller: ${speechResult}`,
              extracted_json: {
                ...existingJson,
                escalation_trigger: escalationCheck.reason,
                last_user_intent: "escalation",
              },
            })
            .eq("id", callId);
        }

        return buildTwimlResponse(
          say("Of course. Let me get someone on the line for you.") +
          `<Redirect>${escapeXml(escalateUrl)}&amp;reason=${escalationCheck.reason}</Redirect>`
        );
      }
    }

    // Handle greeting/small talk naturally before moving to business
    if ((currentIntent === "greeting" || currentIntent === "small_talk") && turnCount <= 2 && !bookingFlowState.active && !callbackFlowState.active) {
      const greetingResponse = currentIntent === "greeting" 
        ? generateGreetingResponse(company?.name || "our office", isAfterHours)
        : generateSmallTalkResponse(isAfterHours);

      await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
        turn: turnCount,
        last_user_utterance: speechResult.substring(0, 500),
        last_ai_response: greetingResponse,
        intent: currentIntent,
        is_after_hours: isAfterHours,
      });

      // Update state
      if (callId) {
        const { data: existingCall } = await supabase
          .from("calls")
          .select("extracted_json, transcript")
          .eq("id", callId)
          .single();

        const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
        const existingTranscript = existingCall?.transcript || "";

        await supabase.from("calls").update({
          transcript: existingTranscript + `\nCaller: ${speechResult}\nAI: ${greetingResponse}`,
          extracted_json: {
            ...existingJson,
            last_user_intent: currentIntent,
          },
        }).eq("id", callId);
      }

      return buildTwimlResponse(
        gather({
          action: nextTurnUrl,
          input: "speech",
          timeout: 5,
          speechTimeout: "auto",
          hints: "booking, appointment, question, help, speak to someone, callback",
          innerTwiml: say(greetingResponse),
        }) +
        say("Sorry — I didn't quite hear that. Want to try again?") +
        `<Redirect method="POST">${escapeXml(nextTurnUrl)}</Redirect>`
      );
    }

    // Handle booking flow (same as before)
    if (bookingStep || bookingFlowState.active || (speechResult && detectBookingIntent(speechResult) && allowedActions.booking)) {
      const bookingTemplate = getBookingTemplate(company?.industry || null);
      
      // If this is a new booking intent, initialize the flow
      if (!bookingFlowState.active && detectBookingIntent(speechResult)) {
        console.log("[twilio-voice-conversation] Booking intent detected, starting booking flow");
        
        if (!allowedActions.booking) {
          return buildTwimlResponse(
            gather({
              action: nextTurnUrl,
              input: "speech",
              timeout: 5,
              speechTimeout: "auto",
              innerTwiml: say("I can't schedule appointments right now, but is there something else I can help with?"),
            }) +
            say("Sorry — I didn't quite hear that. Want to try again?") +
            `<Redirect method="POST">${escapeXml(nextTurnUrl)}</Redirect>`
          );
        }

        if (!company?.booking_link) {
          if (isAfterHours) {
            // After hours without booking link - offer callback
            callbackFlowState = { active: true, step: 0 };
            const callbackUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&callback_step=1`;
            
            return buildTwimlResponse(
              gather({
                action: callbackUrl,
                input: "speech",
                timeout: 8,
                speechTimeout: "auto",
                innerTwiml: say("I'd love to help you book, but we're closed right now. I can have someone call you back to schedule. Can I get your name?"),
              }) +
              say("Sorry — I didn't quite hear that. Want to try again?") +
              `<Redirect method="POST">${escapeXml(callbackUrl)}</Redirect>`
            );
          }
          return buildTwimlResponse(
            say("I'd love to help you book. Let me connect you with someone who can set that up.") +
            `<Redirect>${escapeXml(escalateUrl)}&amp;reason=booking_request</Redirect>`
          );
        }

        bookingFlowState = {
          active: true,
          step: 0,
          industry: company?.industry || "default",
        };

        if (callId) {
          const { data: existingCall } = await supabase
            .from("calls")
            .select("extracted_json, transcript")
            .eq("id", callId)
            .single();

          const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
          const existingTranscript = existingCall?.transcript || "";

          await supabase.from("calls").update({
            transcript: existingTranscript + `\nCaller: ${speechResult}`,
            extracted_json: {
              ...existingJson,
              booking_flow: bookingFlowState,
              last_user_intent: "booking",
            },
          }).eq("id", callId);
        }

        const firstQuestion = `Sure, I can help with that! ${bookingTemplate.questions[0].prompt}`;

        await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
          turn: turnCount,
          last_user_utterance: speechResult.substring(0, 500),
          last_ai_response: firstQuestion,
          booking_started: true,
          intent: "booking",
          is_after_hours: isAfterHours,
        });

        const bookingUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&booking_step=1`;
        return buildTwimlResponse(
          gather({
            action: bookingUrl,
            input: "speech",
            timeout: 8,
            speechTimeout: "auto",
            hints: bookingTemplate.keywords.join(", "),
            innerTwiml: say(firstQuestion),
          }) +
          say("Sorry — I didn't quite hear that. Want to try again?") +
          `<Redirect method="POST">${escapeXml(bookingUrl)}</Redirect>`
        );
      }

      // Continue booking flow
      if (bookingFlowState.active) {
        const currentStep = parseInt(bookingStep || "0", 10);
        
        // Store the answer from the previous step
        if (speechResult && currentStep > 0) {
          const stepIndex = currentStep - 1;
          const questionField = bookingTemplate.questions[stepIndex]?.field;
          
          if (questionField === "service") {
            bookingFlowState.service = speechResult;
          } else if (questionField === "day") {
            bookingFlowState.day = speechResult;
          } else if (questionField === "time") {
            bookingFlowState.time = speechResult;
          } else if (currentStep === 4) {
            // Phone confirmation step
            const confirmed = speechResult.toLowerCase();
            if (confirmed.includes("yes") || confirmed.includes("correct") || confirmed.includes("right") || confirmed.includes("yeah")) {
              bookingFlowState.phone_confirmed = callerNumber;
            } else {
              // Ask for correct number
              const phoneUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&booking_step=5`;
              
              return buildTwimlResponse(
                gather({
                  action: phoneUrl,
                  input: "dtmf speech",
                  timeout: 10,
                  speechTimeout: "auto",
                  innerTwiml: say("No problem. What number should I text the booking link to?"),
                }) +
                say("Sorry — I didn't quite hear that. Want to try again?") +
                `<Redirect method="POST">${escapeXml(phoneUrl)}</Redirect>`
              );
            }
          } else if (currentStep === 5) {
            // Alternative phone number
            const digits = speechResult.replace(/\D/g, "");
            if (digits.length >= 10) {
              bookingFlowState.phone_confirmed = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
            } else {
              bookingFlowState.phone_confirmed = callerNumber;
            }
          }
        }

        bookingFlowState.step = currentStep;

        // Save updated state
        if (callId) {
          const { data: existingCall } = await supabase
            .from("calls")
            .select("extracted_json, transcript")
            .eq("id", callId)
            .single();

          const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
          const existingTranscript = existingCall?.transcript || "";

          await supabase.from("calls").update({
            transcript: existingTranscript + `\nCaller: ${speechResult}`,
            extracted_json: {
              ...existingJson,
              booking_flow: bookingFlowState,
              last_user_intent: "booking",
            },
          }).eq("id", callId);
        }

        const totalQuestions = bookingTemplate.questions.length;
        
        // Ask next question
        if (currentStep < totalQuestions) {
          const acks = ["Got it.", "Perfect.", "Great.", "Okay."];
          const ack = acks[Math.floor(Math.random() * acks.length)];
          const nextQuestion = `${ack} ${bookingTemplate.questions[currentStep].prompt}`;
          
          await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
            turn: turnCount,
            last_user_utterance: speechResult.substring(0, 500),
            last_ai_response: nextQuestion,
            booking_step: currentStep,
            is_after_hours: isAfterHours,
          });

          const nextBookingUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&booking_step=${currentStep + 1}`;
          return buildTwimlResponse(
            gather({
              action: nextBookingUrl,
              input: "speech",
              timeout: 8,
              speechTimeout: "auto",
              hints: bookingTemplate.keywords.join(", "),
              innerTwiml: say(nextQuestion),
            }) +
            say("Sorry — I didn't quite hear that. Want to try again?") +
            `<Redirect method="POST">${escapeXml(nextBookingUrl)}</Redirect>`
          );
        } 
        
        // Confirm phone number
        if (currentStep === totalQuestions && !bookingFlowState.phone_confirmed) {
          const phoneConfirmUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&booking_step=4`;
          const formattedPhone = callerNumber.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
          
          const phoneConfirmMessage = `Perfect! I'll text you a booking link. Should I send it to ${formattedPhone}?`;

          await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
            turn: turnCount,
            last_user_utterance: speechResult.substring(0, 500),
            last_ai_response: phoneConfirmMessage,
            booking_step: currentStep,
            is_after_hours: isAfterHours,
          });

          return buildTwimlResponse(
            gather({
              action: phoneConfirmUrl,
              input: "speech",
              timeout: 5,
              speechTimeout: "auto",
              hints: "yes, no, correct, that's right, wrong number, yeah",
              innerTwiml: say(phoneConfirmMessage),
            }) +
            say("Sorry — I didn't quite hear that. Want to try again?") +
            `<Redirect method="POST">${escapeXml(phoneConfirmUrl)}</Redirect>`
          );
        }
        
        // Send SMS with booking link
        console.log("[twilio-voice-conversation] Sending booking SMS");
        
        const phoneToSend = bookingFlowState.phone_confirmed || callerNumber;
        const serviceSummary = bookingFlowState.service || bookingTemplate.serviceName;
        const daySummary = bookingFlowState.day ? ` on ${bookingFlowState.day}` : "";
        const timeSummary = bookingFlowState.time ? ` (${bookingFlowState.time})` : "";
        
        const smsMessage = `Hi! Thanks for calling ${company?.name || "us"}. Here's your booking link for ${serviceSummary}${daySummary}${timeSummary}: ${company?.booking_link}`;

        try {
          const smsResponse = await fetch(`${functionsBase}/twilio-send-sms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              company_id: companyId,
              to_phone: phoneToSend,
              message: smsMessage,
              call_id: callId,
            }),
          });

          const smsResult = await smsResponse.json();

          if (smsResponse.ok) {
            console.log("[twilio-voice-conversation] SMS sent successfully:", smsResult.message_sid);

            const successMessage = "You're all set — I just sent the link. Is there anything else I can help with?";

            await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
              turn: turnCount,
              last_user_utterance: speechResult.substring(0, 500),
              last_ai_response: successMessage,
              booking_completed: true,
              sms_sent: true,
              is_after_hours: isAfterHours,
            });

            if (callId) {
              await supabase.from("calls").update({ outcome: "booked" }).eq("id", callId);
            }

            // Reset booking flow but stay in conversation
            bookingFlowState = { active: false, step: 0 };
            
            if (callId) {
              const { data: existingCall } = await supabase
                .from("calls")
                .select("extracted_json")
                .eq("id", callId)
                .single();

              const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
              await supabase.from("calls").update({
                extracted_json: {
                  ...existingJson,
                  booking_flow: bookingFlowState,
                  last_user_intent: "booking",
                  booking_completed: true,
                },
              }).eq("id", callId);
            }

            return buildTwimlResponse(
              gather({
                action: nextTurnUrl,
                input: "speech",
                timeout: 5,
                speechTimeout: "auto",
                innerTwiml: say(successMessage),
              }) +
              say("Thank you for calling. Have a great day!") +
              `<Hangup />`
            );
          } else {
            console.error("[twilio-voice-conversation] SMS failed:", smsResult);
            return buildTwimlResponse(
              say("I'm having trouble sending the text. Let me connect you with someone who can help.") +
              `<Redirect>${escapeXml(escalateUrl)}&amp;reason=sms_failed</Redirect>`
            );
          }
        } catch (smsError) {
          console.error("[twilio-voice-conversation] SMS error:", smsError);
          return buildTwimlResponse(
            say("I'm having trouble sending the text. Let me connect you with someone who can help.") +
            `<Redirect>${escapeXml(escalateUrl)}&amp;reason=sms_error</Redirect>`
          );
        }
      }
    }

    // Check if max turns reached
    const maxTurns = (escalationRules.escalateAfterMinutes as number) || 6;
    if (turnCount >= maxTurns) {
      console.log("[twilio-voice-conversation] Max turns reached, offering escalation");

      if (isAfterHours) {
        // After hours - offer callback instead
        callbackFlowState = { active: true, step: 0 };
        const callbackUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&callback_step=1`;
        
        return buildTwimlResponse(
          gather({
            action: callbackUrl,
            input: "speech",
            timeout: 8,
            speechTimeout: "auto",
            innerTwiml: say("I want to make sure you get the help you need. Since we're closed, can I set up a callback for you? What's your name?"),
          }) +
          say("Sorry — I didn't quite hear that. Want to try again?") +
          `<Redirect method="POST">${escapeXml(callbackUrl)}</Redirect>`
        );
      }

      await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
        turn: turnCount,
        last_user_utterance: speechResult.substring(0, 500),
        max_turns_reached: true,
        is_after_hours: isAfterHours,
      });

      return buildTwimlResponse(
        gather({
          action: `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&offer_escalation=true`,
          input: "speech",
          timeout: 3,
          speechTimeout: "auto",
          innerTwiml: say("I want to make sure you're getting the help you need. Would you like to speak with someone on our team?"),
        }) +
        `<Redirect>${escapeXml(escalateUrl)}&amp;reason=max_turns</Redirect>`
      );
    }

    // Call AI to generate response for general questions
    let aiResponse = "Sorry — I didn't quite hear that. Want to try again?";

    if (speechResult && lovableApiKey) {
      try {
        const { data: kbItems } = await supabase
          .from("knowledge_base_items")
          .select("*")
          .eq("company_id", companyId)
          .eq("is_active", true);

        const kbContext = kbItems
          ?.map((item) => `Q: ${item.question || item.title}\nA: ${item.answer}`)
          .join("\n\n") || "";

        const bookingInfo = company?.booking_link && allowedActions.booking
          ? `\nIf they want to book an appointment, offer to help and say you can send a booking link via text.`
          : "";

        // Build conversation context for continuity
        const contextNote = turnCount > 1 
          ? `This is turn ${turnCount} of the conversation. Keep responses brief and natural.`
          : "";

        // After-hours context
        const afterHoursContext = isAfterHours
          ? `\nIMPORTANT: It is currently after hours. The business is closed.
- If asked to transfer to a person, say: "I can't connect you right now since we're closed, but I can create a callback request for the next business day."
- Be helpful but remind them the office is closed if relevant.
- Offer to take a message or create a callback request if they need to speak to someone.`
          : "";

        const systemPrompt = `You are a friendly phone receptionist for ${company?.name || "the company"}.

${aiProfile?.system_prompt || "Be helpful and warm."}

RULES:
1. Keep responses to 1-2 sentences max
2. Sound natural, not robotic
3. If you don't know something, offer to transfer to a team member (or take a message if after hours)
4. Never make up information${bookingInfo}${afterHoursContext}

${contextNote}

Knowledge Base:
${kbContext || "No specific info available."}`;

        console.log("[twilio-voice-conversation] Calling AI...");
        
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: speechResult },
            ],
            max_tokens: 100,
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          aiResponse = data.choices?.[0]?.message?.content || aiResponse;
          
          aiResponse = aiResponse
            .replace(/\*\*/g, "")
            .replace(/\*/g, "")
            .replace(/```[\s\S]*?```/g, "")
            .trim();
          
          // Ensure response isn't too long for voice
          if (aiResponse.length > 200) {
            const sentences = aiResponse.match(/[^.!?]+[.!?]+/g) || [aiResponse];
            aiResponse = sentences.slice(0, 2).join(" ").trim();
          }
          
          console.log("[twilio-voice-conversation] AI response:", aiResponse.substring(0, 100));
        } else {
          const errText = await response.text();
          console.error("[twilio-voice-conversation] AI error:", response.status, errText);
        }
      } catch (aiError) {
        console.error("[twilio-voice-conversation] AI error:", aiError);
      }
    }

    // Log the conversation turn
    await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
      turn: turnCount,
      last_user_utterance: speechResult.substring(0, 500),
      last_ai_response: aiResponse.substring(0, 500),
      confidence,
      intent: currentIntent,
      is_after_hours: isAfterHours,
    });

    // Update call transcript and state
    if (callId) {
      const { data: existingCall } = await supabase
        .from("calls")
        .select("transcript, extracted_json")
        .eq("id", callId)
        .single();

      const existingTranscript = existingCall?.transcript || "";
      const existingJson = (existingCall?.extracted_json as Record<string, unknown>) || {};
      
      const newTranscript = speechResult
        ? `${existingTranscript}\nCaller: ${speechResult}\nAI: ${aiResponse}`
        : existingTranscript;

      await supabase.from("calls").update({ 
        transcript: newTranscript.trim(),
        extracted_json: {
          ...existingJson,
          last_user_intent: currentIntent,
        },
      }).eq("id", callId);
    }

    console.log("[twilio-voice-conversation] ====== RESPONDING ======");

    // Continue conversation - use contextual follow-up, not generic "How can I help"
    const followUp = turnCount > 1 
      ? "Anything else?" 
      : "";
    
    const fullResponse = followUp ? `${aiResponse} ${followUp}` : aiResponse;

    return buildTwimlResponse(
      gather({
        action: nextTurnUrl,
        input: "speech",
        timeout: 5,
        speechTimeout: "auto",
        hints: "yes, no, booking, appointment, schedule, quote, question, help, speak to someone, transfer, thank you, goodbye, that's all, callback",
        innerTwiml: say(fullResponse),
      }) +
      say("Sorry — I didn't quite hear that. Want to try again?") +
      `<Redirect method="POST">${escapeXml(nextTurnUrl)}</Redirect>`
    );
  } catch (error) {
    console.error("[twilio-voice-conversation] ====== UNEXPECTED ERROR ======");
    console.error("[twilio-voice-conversation] Error:", error);
    console.error("[twilio-voice-conversation] Stack:", error instanceof Error ? error.stack : "no stack");
    
    return buildErrorTwiml();
  }
});
