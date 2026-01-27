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
  primary_phone: string | null;
  fallback_phone: string | null;
  booking_link: string | null;
  twilio_number: string | null;
  ai_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  company_id: string;
  role: AppRole;
  created_at: string;
  profile?: Profile;
}

export interface CompanyHours {
  id: string;
  company_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface CompanyHoliday {
  id: string;
  company_id: string;
  date: string;
  is_closed: boolean;
  note: string | null;
}

export interface AIProfile {
  id: string;
  company_id: string;
  system_prompt: string;
  tone: string;
  language: string;
  voice_id: string;
  greeting_script: string;
  disclosure_script: string;
  after_hours_script: string;
  allowed_actions_json: AllowedActions;
  escalation_rules_json: EscalationRules;
  updated_at: string;
}

export interface AllowedActions {
  faq: boolean;
  booking: boolean;
  quote: boolean;
  reschedule: boolean;
  escalate: boolean;
}

export interface EscalationRules {
  escalateOnRequest: boolean;
  escalateOnComplaint: boolean;
  escalateAfterMinutes: number;
}

export interface KnowledgeBaseItem {
  id: string;
  company_id: string;
  type: 'faq' | 'services' | 'pricing' | 'policies';
  title: string;
  question: string | null;
  answer: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  company_id: string;
  caller_number: string | null;
  caller_name: string | null;
  started_at: string;
  ended_at: string | null;
  outcome: 'answered' | 'escalated' | 'booked' | 'voicemail' | 'abandoned' | null;
  transcript: string | null;
  summary: string | null;
  extracted_json: Record<string, unknown>;
  recording_url: string | null;
  cost_cents: number;
  internal_notes: string | null;
}

export interface FollowupTask {
  id: string;
  company_id: string;
  call_id: string | null;
  assigned_to: string | null;
  title: string;
  due_at: string | null;
  status: 'open' | 'done';
  notes: string | null;
  created_at: string;
}

export interface Audit {
  id: string;
  company_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Form types for wizard
export interface CreateCompanyFormData {
  // Step 1: Basics
  name: string;
  industry: string;
  timezone: string;
  // Step 2: Business Hours
  business_hours: DaySchedule[];
  holidays: HolidayInput[];
  // Step 3: Contact Routing
  primary_phone: string;
  fallback_phone: string;
  booking_link: string;
  // Step 4: AI Preset
  ai_tone: string;
  ai_voice: string;
  ai_language: string;
}

export interface DaySchedule {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface HolidayInput {
  date: string;
  note: string;
}
