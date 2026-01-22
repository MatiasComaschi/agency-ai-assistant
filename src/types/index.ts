export type AppRole = 'agency_admin' | 'company_owner' | 'company_staff';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  timezone: string;
  status: 'active' | 'paused' | 'inactive';
  business_hours: BusinessHours;
  holidays: Holiday[];
  primary_phone: string | null;
  fallback_phone: string | null;
  booking_link: string | null;
  ai_greeting: string;
  ai_disclosure: string;
  ai_persona_prompt: string;
  ai_tone: string;
  ai_voice: string;
  ai_language: string;
  ai_allow_faq: boolean;
  ai_allow_booking: boolean;
  ai_allow_quote: boolean;
  ai_allow_reschedule: boolean;
  ai_allow_escalate: boolean;
  escalation_rules: EscalationRules;
  after_hours_behavior: 'voicemail' | 'message' | 'forward';
  after_hours_message: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface DaySchedule {
  open: string;
  close: string;
  closed: boolean;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface EscalationRules {
  escalateOnRequest: boolean;
  escalateOnComplaint: boolean;
  escalateAfterMinutes: number;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  profile?: Profile;
}

export interface KnowledgeBaseItem {
  id: string;
  company_id: string;
  type: 'faq' | 'service' | 'pricing' | 'policy';
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  company_id: string;
  caller_phone: string | null;
  caller_name: string | null;
  duration_seconds: number;
  outcome: 'answered' | 'missed' | 'voicemail' | 'escalated' | null;
  escalated: boolean;
  booked: boolean;
  intent: string | null;
  transcript: string | null;
  summary: string | null;
  extracted_fields: Record<string, unknown>;
  internal_notes: string | null;
  created_at: string;
}

export interface TeamInvitation {
  id: string;
  company_id: string;
  email: string;
  role: AppRole;
  invited_by: string | null;
  accepted: boolean;
  created_at: string;
  expires_at: string;
}

// Form types
export interface CreateCompanyFormData {
  // Step 1: Basics
  name: string;
  industry: string;
  timezone: string;
  // Step 2: Business Hours
  business_hours: BusinessHours;
  holidays: Holiday[];
  // Step 3: Contact Routing
  primary_phone: string;
  fallback_phone: string;
  booking_link: string;
  // Step 4: AI Preset
  ai_tone: string;
  ai_voice: string;
  ai_language: string;
}
