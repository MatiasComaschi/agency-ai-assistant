// Input validation and sanitization utilities

// Phone number validation (E.164 format)
export function validatePhoneNumber(phone: string): { valid: boolean; sanitized: string } {
  if (!phone) {
    return { valid: false, sanitized: "" };
  }

  // Remove all non-digit characters except leading +
  let sanitized = phone.replace(/[^\d+]/g, "");

  // Ensure it starts with +
  if (!sanitized.startsWith("+")) {
    // Assume US number if 10-11 digits
    const digits = sanitized.replace(/\D/g, "");
    if (digits.length === 10) {
      sanitized = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      sanitized = `+${digits}`;
    } else {
      sanitized = `+${digits}`;
    }
  }

  // Validate E.164 format: + followed by 7-15 digits
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  const valid = e164Regex.test(sanitized);

  return { valid, sanitized: valid ? sanitized : "" };
}

// UUID validation
export function validateUuid(uuid: string): boolean {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// String sanitization (remove potential injection characters)
export function sanitizeString(input: string, maxLength = 1000): string {
  if (!input) return "";
  
  // Trim and limit length
  let sanitized = input.trim().substring(0, maxLength);
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");
  
  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  
  return sanitized;
}

// SQL injection prevention - escape single quotes
export function escapeSqlString(input: string): string {
  if (!input) return "";
  return input.replace(/'/g, "''");
}

// HTML/XML escape for TwiML
export function escapeXml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// URL validation
export function validateUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Validate Twilio request parameters
export interface TwilioParams {
  CallSid?: string;
  From?: string;
  To?: string;
  Called?: string;
  Caller?: string;
  SpeechResult?: string;
  Confidence?: string;
  RecordingUrl?: string;
  RecordingDuration?: string;
  TranscriptionText?: string;
  DialCallStatus?: string;
  [key: string]: string | undefined;
}

export function validateTwilioParams(params: TwilioParams): {
  valid: boolean;
  errors: string[];
  sanitized: TwilioParams;
} {
  const errors: string[] = [];
  const sanitized: TwilioParams = {};

  // CallSid validation (Twilio format: CA + 32 hex chars)
  if (params.CallSid) {
    const callSidRegex = /^CA[a-f0-9]{32}$/i;
    if (callSidRegex.test(params.CallSid)) {
      sanitized.CallSid = params.CallSid;
    } else {
      errors.push("Invalid CallSid format");
    }
  }

  // Phone number validation
  const phoneFields = ["From", "To", "Called", "Caller"];
  for (const field of phoneFields) {
    if (params[field]) {
      const result = validatePhoneNumber(params[field] as string);
      if (result.valid) {
        sanitized[field] = result.sanitized;
      } else {
        // Still include but flag as potentially invalid
        sanitized[field] = sanitizeString(params[field] as string, 20);
      }
    }
  }

  // Speech result sanitization
  if (params.SpeechResult) {
    sanitized.SpeechResult = sanitizeString(params.SpeechResult, 2000);
  }

  // Confidence validation (0-1 float)
  if (params.Confidence) {
    const confidence = parseFloat(params.Confidence);
    if (!isNaN(confidence) && confidence >= 0 && confidence <= 1) {
      sanitized.Confidence = confidence.toString();
    }
  }

  // Recording URL validation
  if (params.RecordingUrl) {
    if (validateUrl(params.RecordingUrl) && params.RecordingUrl.includes("twilio.com")) {
      sanitized.RecordingUrl = params.RecordingUrl;
    } else {
      errors.push("Invalid RecordingUrl");
    }
  }

  // Recording duration validation
  if (params.RecordingDuration) {
    const duration = parseInt(params.RecordingDuration, 10);
    if (!isNaN(duration) && duration >= 0 && duration <= 86400) {
      sanitized.RecordingDuration = duration.toString();
    }
  }

  // Transcription text sanitization
  if (params.TranscriptionText) {
    sanitized.TranscriptionText = sanitizeString(params.TranscriptionText, 5000);
  }

  // Dial call status validation
  if (params.DialCallStatus) {
    const validStatuses = ["completed", "busy", "no-answer", "failed", "canceled"];
    if (validStatuses.includes(params.DialCallStatus.toLowerCase())) {
      sanitized.DialCallStatus = params.DialCallStatus.toLowerCase();
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

// Validate request body for API endpoints
export function validateRequestBody<T>(
  body: unknown,
  requiredFields: (keyof T)[],
  optionalFields: (keyof T)[] = []
): { valid: boolean; errors: string[]; data: Partial<T> } {
  const errors: string[] = [];
  const data: Partial<T> = {};

  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Request body must be an object"], data: {} };
  }

  const bodyObj = body as Record<string, unknown>;

  // Check required fields
  for (const field of requiredFields) {
    if (bodyObj[field as string] === undefined || bodyObj[field as string] === null) {
      errors.push(`Missing required field: ${String(field)}`);
    } else {
      (data as Record<string, unknown>)[field as string] = bodyObj[field as string];
    }
  }

  // Include optional fields if present
  for (const field of optionalFields) {
    if (bodyObj[field as string] !== undefined) {
      (data as Record<string, unknown>)[field as string] = bodyObj[field as string];
    }
  }

  return { valid: errors.length === 0, errors, data };
}
