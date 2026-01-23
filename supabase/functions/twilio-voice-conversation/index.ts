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

const escapeXml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

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

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse URL params
    const url = new URL(req.url);
    const callId = url.searchParams.get("call_id");
    const companyId = url.searchParams.get("company_id");
    const turnCount = parseInt(url.searchParams.get("turn") || "1", 10);
    const bookingStep = url.searchParams.get("booking_step");

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

    const speechResult = params.SpeechResult || "";
    const confidence = parseFloat(params.Confidence || "0");
    const callerNumber = params.From || params.Caller || "";

    console.log("[twilio-voice-conversation] Processing speech:", {
      callId,
      companyId,
      turnCount,
      bookingStep,
      speechResult: speechResult.substring(0, 100),
      confidence,
    });

    if (!companyId) {
      console.error("[twilio-voice-conversation] Missing company_id");
      return twimlResponse(
        say("We're sorry, but we cannot process your request. Goodbye.") +
        `<Hangup />`
      );
    }

    // Build base URLs
    const baseUrl = supabaseUrl.replace("/rest/v1", "");
    const functionsBase = `${baseUrl}/functions/v1`;
    const escalateUrl = `${functionsBase}/twilio-voice-escalate?call_id=${callId}&company_id=${companyId}`;
    const nextTurnUrl = `${functionsBase}/twilio-voice-conversation?call_id=${callId}&company_id=${companyId}&turn=${turnCount + 1}`;

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

        return twimlResponse(
          say("I understand. Let me transfer you to a team member who can better assist you.") +
          `<Redirect>${escalateUrl}&amp;reason=${escalationCheck.reason}</Redirect>`
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
          return twimlResponse(
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
          return twimlResponse(
            gather({
              action: nextTurnUrl,
              input: "speech",
              timeout: 5,
              speechTimeout: "auto",
              innerTwiml: say("I'd be happy to help you schedule an appointment. Let me transfer you to someone who can assist with booking."),
            }) +
            `<Redirect>${escalateUrl}&amp;reason=booking_request</Redirect>`
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

        // Ask first booking question
        const bookingUrl = `${functionsBase}/twilio-voice-conversation?call_id=${callId}&company_id=${companyId}&turn=${turnCount + 1}&booking_step=1`;
        return twimlResponse(
          gather({
            action: bookingUrl,
            input: "speech",
            timeout: 8,
            speechTimeout: "auto",
            hints: bookingTemplate.keywords.join(", "),
            innerTwiml: say(`Great! I can help you book a ${bookingTemplate.serviceName}. ${bookingTemplate.questions[0]}`),
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
              const phoneUrl = `${functionsBase}/twilio-voice-conversation?call_id=${callId}&company_id=${companyId}&turn=${turnCount + 1}&booking_step=4`;
              
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

              return twimlResponse(
                gather({
                  action: phoneUrl,
                  input: "dtmf speech",
                  timeout: 10,
                  speechTimeout: "auto",
                  innerTwiml: say("No problem. What phone number should I send the booking link to? You can say or dial the number."),
                }) +
                say("I didn't get that number. Let me transfer you to someone who can help.") +
                `<Redirect>${escalateUrl}&amp;reason=phone_collection_failed</Redirect>`
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
          const nextBookingUrl = `${functionsBase}/twilio-voice-conversation?call_id=${callId}&company_id=${companyId}&turn=${turnCount + 1}&booking_step=${currentStep + 1}`;
          return twimlResponse(
            gather({
              action: nextBookingUrl,
              input: "speech",
              timeout: 8,
              speechTimeout: "auto",
              hints: bookingTemplate.keywords.join(", "),
              innerTwiml: say(`Got it. ${bookingTemplate.questions[currentStep]}`),
            }) +
            say("I didn't catch that. " + bookingTemplate.questions[currentStep]) +
            `<Hangup />`
          );
        } else if (currentStep === totalQuestions && !bookingFlowState.phone_confirmed) {
          // Confirm phone number for SMS
          const phoneConfirmUrl = `${functionsBase}/twilio-voice-conversation?call_id=${callId}&company_id=${companyId}&turn=${turnCount + 1}&booking_step=3`;
          const formattedPhone = callerNumber.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
          
          return twimlResponse(
            gather({
              action: phoneConfirmUrl,
              input: "speech",
              timeout: 5,
              speechTimeout: "auto",
              hints: "yes, no, correct, that's right, wrong number",
              innerTwiml: say(`Perfect! I'll send you a booking link via text message. Just to confirm, should I send it to ${formattedPhone}?`),
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

              // Update call outcome
              if (callId) {
                await supabase
                  .from("calls")
                  .update({ outcome: "booked" })
                  .eq("id", callId);
              }

              return twimlResponse(
                gather({
                  action: nextTurnUrl,
                  input: "speech",
                  timeout: 5,
                  speechTimeout: "auto",
                  innerTwiml: say(`I've sent you a text message with the booking link. You should receive it shortly. Is there anything else I can help you with today?`),
                }) +
                say("Thank you for calling. Have a great day! Goodbye.") +
                `<Hangup />`
              );
            } else {
              console.error("[twilio-voice-conversation] SMS send failed:", smsResult);
              return twimlResponse(
                say("I apologize, but I wasn't able to send the text message. Let me transfer you to someone who can help you complete your booking.") +
                `<Redirect>${escalateUrl}&amp;reason=sms_failed</Redirect>`
              );
            }
          } catch (smsError) {
            console.error("[twilio-voice-conversation] SMS error:", smsError);
            return twimlResponse(
              say("I apologize, but I'm having trouble sending the text message. Let me transfer you to someone who can help.") +
              `<Redirect>${escalateUrl}&amp;reason=sms_error</Redirect>`
            );
          }
        }
      }
    }

    // Check if max turns reached
    const maxTurns = (escalationRules.escalateAfterMinutes as number) || 5;
    if (turnCount >= maxTurns) {
      console.log("[twilio-voice-conversation] Max turns reached, offering escalation");
      return twimlResponse(
        gather({
          action: `${functionsBase}/twilio-voice-conversation?call_id=${callId}&company_id=${companyId}&turn=${turnCount + 1}&offer_escalation=true`,
          input: "speech",
          timeout: 3,
          speechTimeout: "auto",
          innerTwiml: say("I want to make sure I'm helping you properly. Would you like me to transfer you to a team member, or is there something else I can help you with?"),
        }) +
        `<Redirect>${escalateUrl}&amp;reason=max_turns</Redirect>`
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
        }
      } catch (aiError) {
        console.error("[twilio-voice-conversation] AI error:", aiError);
      }
    }

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

    console.log("[twilio-voice-conversation] AI response:", aiResponse.substring(0, 100));

    // Continue conversation
    return twimlResponse(
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
    console.error("[twilio-voice-conversation] Unexpected error:", error);
    return twimlResponse(
      say("We're sorry, but we encountered an error. Please try calling back later.") +
      `<Hangup />`
    );
  }
});
