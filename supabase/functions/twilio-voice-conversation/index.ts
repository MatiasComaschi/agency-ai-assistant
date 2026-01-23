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

// Industry-specific booking templates
const INDUSTRY_BOOKING_TEMPLATES: Record<string, {
  questions: string[];
  keywords: string[];
  serviceName: string;
}> = {
  salon: {
    questions: [
      "What type of service are you looking for? For example, a haircut, coloring, styling, or treatment?",
      "Do you have a preferred stylist, or would you like me to book with whoever is available?",
      "What day and time works best for you?",
    ],
    keywords: ["haircut", "color", "styling", "treatment", "trim", "highlights", "perm", "blowout", "manicure", "pedicure"],
    serviceName: "salon appointment",
  },
  hvac: {
    questions: [
      "What issue are you experiencing? Is it AC not cooling, heating not working, or do you need maintenance?",
      "What is the service address?",
      "How urgent is this? Do you need emergency service, same-day, or within the week?",
    ],
    keywords: ["ac", "air conditioning", "heating", "furnace", "maintenance", "repair", "install", "thermostat", "duct"],
    serviceName: "service appointment",
  },
  plumber: {
    questions: [
      "What plumbing issue are you dealing with? Is it a leak, clog, installation, or water heater problem?",
      "What is the service address?",
      "How urgent is this? Do you need emergency service, same-day, or can it wait a few days?",
    ],
    keywords: ["leak", "clog", "drain", "pipe", "water heater", "toilet", "faucet", "sewer", "installation"],
    serviceName: "plumbing service",
  },
  default: {
    questions: [
      "What service are you interested in?",
      "When would you like to schedule this?",
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

const getBookingTemplate = (industry: string | null): typeof INDUSTRY_BOOKING_TEMPLATES.default => {
  const normalizedIndustry = (industry || "").toLowerCase();
  return INDUSTRY_BOOKING_TEMPLATES[normalizedIndustry] || INDUSTRY_BOOKING_TEMPLATES.default;
};

interface BookingFlowState {
  active: boolean;
  step: number;
  service_requested?: string;
  preferred_time?: string;
  address?: string;
  urgency?: string;
  phone_confirmed?: string;
  industry?: string;
}

interface ExtractedJson {
  booking_flow?: BookingFlowState;
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
    };

    const allowedActions = (aiProfile?.allowed_actions_json as Record<string, boolean>) || {
      booking: true,
      faq: true,
      quote: false,
      escalate: true,
    };

    // Get current booking flow state from call record
    let bookingFlowState: BookingFlowState = { active: false, step: 0 };
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
    }

    // Check for escalation triggers first
    if (speechResult) {
      const escalationCheck = shouldEscalate(speechResult, escalationRules);
      if (escalationCheck.escalate) {
        console.log("[twilio-voice-conversation] Escalating:", escalationCheck.reason);

        // Log audit for escalation
        await logAudit(supabase, companyId, "conversation_escalate", "twilio_conversation", callId, {
          turn: turnCount,
          escalation_reason: escalationCheck.reason,
          last_user_utterance: speechResult.substring(0, 500),
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
              },
            })
            .eq("id", callId);
        }

        return buildTwimlResponse(
          say("I understand. Let me transfer you to a team member who can better assist you.") +
          `<Redirect>${escapeXml(escalateUrl)}&amp;reason=${escalationCheck.reason}</Redirect>`
        );
      }
    }

    // Handle booking flow
    if (bookingStep || bookingFlowState.active || (speechResult && detectBookingIntent(speechResult) && allowedActions.booking)) {
      const bookingTemplate = getBookingTemplate(company?.industry || null);
      
      // If this is a new booking intent, initialize the flow
      if (!bookingFlowState.active && detectBookingIntent(speechResult)) {
        console.log("[twilio-voice-conversation] Booking intent detected, starting booking flow");
        
        // Check if booking is allowed
        if (!allowedActions.booking) {
          await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
            turn: turnCount,
            last_user_utterance: speechResult.substring(0, 500),
            last_ai_response: "I'm sorry, but I'm not able to schedule appointments at this time.",
            booking_blocked: true,
          });

          return buildTwimlResponse(
            gather({
              action: nextTurnUrl,
              input: "speech",
              timeout: 5,
              speechTimeout: "auto",
              innerTwiml: say("I'm sorry, but I'm not able to schedule appointments at this time. Is there something else I can help you with?"),
            }) +
            say("Are you still there?") +
            `<Hangup />`
          );
        }

        // Check if company has booking capability
        if (!company?.booking_link) {
          await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
            turn: turnCount,
            last_user_utterance: speechResult.substring(0, 500),
            last_ai_response: "Let me transfer you to someone who can assist with booking.",
            booking_escalated: true,
          });

          return buildTwimlResponse(
            gather({
              action: nextTurnUrl,
              input: "speech",
              timeout: 5,
              speechTimeout: "auto",
              innerTwiml: say("I'd be happy to help you schedule an appointment. Let me transfer you to someone who can assist with booking."),
            }) +
            `<Redirect>${escapeXml(escalateUrl)}&amp;reason=booking_request</Redirect>`
          );
        }

        bookingFlowState = {
          active: true,
          step: 0,
          industry: company?.industry || "default",
        };

        // Save initial booking state
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
                booking_flow: bookingFlowState,
              },
            })
            .eq("id", callId);
        }

        const firstQuestion = `Great! I can help you book a ${bookingTemplate.serviceName}. ${bookingTemplate.questions[0]}`;

        await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
          turn: turnCount,
          last_user_utterance: speechResult.substring(0, 500),
          last_ai_response: firstQuestion,
          booking_started: true,
        });

        // Ask first booking question
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
          say("I didn't catch that. " + bookingTemplate.questions[0]) +
          `<Hangup />`
        );
      }

      // Continue booking flow based on current step
      if (bookingFlowState.active) {
        const currentStep = parseInt(bookingStep || "0", 10);
        
        // Store the answer from the previous step
        if (speechResult) {
          if (currentStep === 1) {
            bookingFlowState.service_requested = speechResult;
          } else if (currentStep === 2) {
            bookingFlowState.preferred_time = speechResult;
          } else if (currentStep === 3) {
            // This is the phone confirmation step
            const confirmed = speechResult.toLowerCase();
            if (confirmed.includes("yes") || confirmed.includes("correct") || confirmed.includes("right")) {
              bookingFlowState.phone_confirmed = callerNumber;
            } else {
              // They said no, ask for correct number
              const phoneUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&booking_step=4`;
              
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
                    transcript: existingTranscript + `\nCaller: ${speechResult}\nAI: What number should I send the booking link to?`,
                    extracted_json: {
                      ...existingJson,
                      booking_flow: bookingFlowState,
                    },
                  })
                  .eq("id", callId);
              }

              await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
                turn: turnCount,
                last_user_utterance: speechResult.substring(0, 500),
                last_ai_response: "What number should I send the booking link to?",
                booking_step: currentStep,
              });

              return buildTwimlResponse(
                gather({
                  action: phoneUrl,
                  input: "dtmf speech",
                  timeout: 10,
                  speechTimeout: "auto",
                  innerTwiml: say("No problem. What phone number should I send the booking link to? You can say or dial the number."),
                }) +
                say("I didn't get that number. Let me transfer you to someone who can help.") +
                `<Redirect>${escapeXml(escalateUrl)}&amp;reason=phone_collection_failed</Redirect>`
              );
            }
          } else if (currentStep === 4) {
            // They provided an alternative phone number
            const digits = speechResult.replace(/\D/g, "");
            if (digits.length >= 10) {
              bookingFlowState.phone_confirmed = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
            } else {
              bookingFlowState.phone_confirmed = callerNumber; // Fallback to caller number
            }
          }
        }

        bookingFlowState.step = currentStep;

        // Save updated booking state
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
                booking_flow: bookingFlowState,
              },
            })
            .eq("id", callId);
        }

        // Determine next step
        const totalQuestions = bookingTemplate.questions.length;
        
        if (currentStep < totalQuestions) {
          // Ask next question
          const nextQuestion = `Got it. ${bookingTemplate.questions[currentStep]}`;
          
          await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
            turn: turnCount,
            last_user_utterance: speechResult.substring(0, 500),
            last_ai_response: nextQuestion,
            booking_step: currentStep,
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
            say("I didn't catch that. " + bookingTemplate.questions[currentStep]) +
            `<Hangup />`
          );
        } else if (currentStep === totalQuestions && !bookingFlowState.phone_confirmed) {
          // Confirm phone number for SMS
          const phoneConfirmUrl = `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&booking_step=3`;
          const formattedPhone = callerNumber.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
          
          const phoneConfirmMessage = `Perfect! I'll send you a booking link via text message. Just to confirm, should I send it to ${formattedPhone}?`;

          await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
            turn: turnCount,
            last_user_utterance: speechResult.substring(0, 500),
            last_ai_response: phoneConfirmMessage,
            booking_step: currentStep,
            phone_confirm: true,
          });

          return buildTwimlResponse(
            gather({
              action: phoneConfirmUrl,
              input: "speech",
              timeout: 5,
              speechTimeout: "auto",
              hints: "yes, no, correct, that's right, wrong number",
              innerTwiml: say(phoneConfirmMessage),
            }) +
            say("Should I send the booking link to this number?") +
            `<Hangup />`
          );
        } else {
          // Send SMS with booking link
          console.log("[twilio-voice-conversation] Sending booking SMS");
          
          const phoneToSend = bookingFlowState.phone_confirmed || callerNumber;
          const serviceSummary = bookingFlowState.service_requested || bookingTemplate.serviceName;
          const timeSummary = bookingFlowState.preferred_time ? ` for ${bookingFlowState.preferred_time}` : "";
          
          const smsMessage = `Hi! Thanks for calling ${company?.name || "us"}. Here's your booking link for ${serviceSummary}${timeSummary}: ${company?.booking_link}`;

          // Call SMS edge function
          try {
            const smsResponse = await fetch(`${functionsBase}/twilio-send-sms`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
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

              const successMessage = "I've sent you a text message with the booking link. You should receive it shortly. Is there anything else I can help you with today?";

              await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
                turn: turnCount,
                last_user_utterance: speechResult.substring(0, 500),
                last_ai_response: successMessage,
                booking_completed: true,
                sms_sent: true,
                sms_to: phoneToSend,
              });

              // Update call outcome
              if (callId) {
                await supabase
                  .from("calls")
                  .update({ outcome: "booked" })
                  .eq("id", callId);
              }

              return buildTwimlResponse(
                gather({
                  action: nextTurnUrl,
                  input: "speech",
                  timeout: 5,
                  speechTimeout: "auto",
                  innerTwiml: say(successMessage),
                }) +
                say("Thank you for calling. Have a great day! Goodbye.") +
                `<Hangup />`
              );
            } else {
              console.error("[twilio-voice-conversation] SMS send failed:", smsResult);

              await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
                turn: turnCount,
                last_user_utterance: speechResult.substring(0, 500),
                last_ai_response: "SMS failed - escalating",
                sms_error: smsResult,
              });

              return buildTwimlResponse(
                say("I apologize, but I wasn't able to send the text message. Let me transfer you to someone who can help you complete your booking.") +
                `<Redirect>${escapeXml(escalateUrl)}&amp;reason=sms_failed</Redirect>`
              );
            }
          } catch (smsError) {
            console.error("[twilio-voice-conversation] SMS error:", smsError);

            await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
              turn: turnCount,
              last_user_utterance: speechResult.substring(0, 500),
              last_ai_response: "SMS exception - escalating",
              sms_exception: String(smsError),
            });

            return buildTwimlResponse(
              say("I apologize, but I'm having trouble sending the text message. Let me transfer you to someone who can help.") +
              `<Redirect>${escapeXml(escalateUrl)}&amp;reason=sms_error</Redirect>`
            );
          }
        }
      }
    }

    // Check if max turns reached
    const maxTurns = (escalationRules.escalateAfterMinutes as number) || 5;
    if (turnCount >= maxTurns) {
      console.log("[twilio-voice-conversation] Max turns reached, offering escalation");

      await logAudit(supabase, companyId, "conversation_turn", "twilio_conversation", callId, {
        turn: turnCount,
        last_user_utterance: speechResult.substring(0, 500),
        last_ai_response: "Max turns reached - offering escalation",
        max_turns_reached: true,
      });

      return buildTwimlResponse(
        gather({
          action: `${functionsBase}/twilio-voice-conversation?call_id=${encodeURIComponent(callId || callSid)}&company_id=${encodeURIComponent(companyId)}&turn=${turnCount + 1}&offer_escalation=true`,
          input: "speech",
          timeout: 3,
          speechTimeout: "auto",
          innerTwiml: say("I want to make sure I'm helping you properly. Would you like me to transfer you to a team member, or is there something else I can help you with?"),
        }) +
        `<Redirect>${escapeXml(escalateUrl)}&amp;reason=max_turns</Redirect>`
      );
    }

    // Call AI to generate response
    let aiResponse = "I'm sorry, I didn't quite catch that. Could you please repeat your question?";

    if (speechResult && lovableApiKey) {
      try {
        // Fetch knowledge base
        const { data: kbItems } = await supabase
          .from("knowledge_base_items")
          .select("*")
          .eq("company_id", companyId)
          .eq("is_active", true);

        // Build context
        const kbContext = kbItems
          ?.map((item) => `Q: ${item.question || item.title}\nA: ${item.answer}`)
          .join("\n\n") || "";

        // Add booking capability to system prompt if available
        const bookingInfo = company?.booking_link && allowedActions.booking
          ? `\n\nBOOKING: If the caller wants to book an appointment, you can offer to send them a booking link via text message. Ask about their service needs first.`
          : "";

        const systemPrompt = `You are a helpful AI phone receptionist for ${company?.name || "the company"}.

${aiProfile?.system_prompt || "You are friendly and professional."}

Tone: ${aiProfile?.tone || "professional"}

IMPORTANT RULES:
1. Keep responses brief and conversational (1-3 sentences max)
2. If you cannot help with something, apologize and offer to transfer to a team member
3. Never make up information - only use the knowledge base provided
4. Be empathetic and patient${bookingInfo}

Knowledge Base:
${kbContext || "No specific information available."}

Respond to the caller's question naturally and briefly.`;

        console.log("[twilio-voice-conversation] Calling AI API...");
        
        const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: speechResult },
            ],
            max_tokens: 150,
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          aiResponse = data.choices?.[0]?.message?.content || aiResponse;
          
          // Clean up response for TTS
          aiResponse = aiResponse
            .replace(/\*\*/g, "")
            .replace(/\*/g, "")
            .replace(/```[\s\S]*?```/g, "")
            .trim();
          
          console.log("[twilio-voice-conversation] AI response received:", aiResponse.substring(0, 100));
        } else {
          console.error("[twilio-voice-conversation] AI API error:", response.status, await response.text());
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
    });

    // Update call transcript
    if (callId) {
      const { data: existingCall } = await supabase
        .from("calls")
        .select("transcript")
        .eq("id", callId)
        .single();

      const existingTranscript = existingCall?.transcript || "";
      const newTranscript = speechResult
        ? `${existingTranscript}\nCaller: ${speechResult}\nAI: ${aiResponse}`
        : existingTranscript;

      await supabase
        .from("calls")
        .update({ transcript: newTranscript.trim() })
        .eq("id", callId);
    }

    console.log("[twilio-voice-conversation] ====== RESPONDING ======");

    // Continue conversation
    return buildTwimlResponse(
      gather({
        action: nextTurnUrl,
        input: "speech",
        timeout: 5,
        speechTimeout: "auto",
        hints: "yes, no, booking, appointment, schedule, quote, question, help, speak to someone, transfer, thank you, goodbye",
        innerTwiml: say(aiResponse),
      }) +
      // If no response, prompt again or end
      say("Are you still there? If you have any other questions, please let me know. Otherwise, thank you for calling. Goodbye.") +
      `<Hangup />`
    );
  } catch (error) {
    // CRITICAL: Catch-all error handler - MUST return valid TwiML
    console.error("[twilio-voice-conversation] ====== UNEXPECTED ERROR ======");
    console.error("[twilio-voice-conversation] Error:", error);
    console.error("[twilio-voice-conversation] Stack:", error instanceof Error ? error.stack : "no stack");
    
    return buildErrorTwiml();
  }
});
