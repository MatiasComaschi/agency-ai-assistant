export interface IndustryTemplate {
  id: string;
  name: string;
  industry: string;
  description: string | null;
  system_prompt: string;
  greeting_script: string | null;
  disclosure_script: string | null;
  after_hours_script: string | null;
  tone: string | null;
  language: string | null;
  voice_id: string | null;
  allowed_actions_json: {
    faq: boolean;
    booking: boolean;
    quote: boolean;
    reschedule: boolean;
    escalate: boolean;
  } | null;
  escalation_rules_json: {
    escalateOnRequest: boolean;
    escalateOnComplaint: boolean;
    escalateAfterMinutes: number;
  } | null;
  kb_items_json: KBTemplateItem[] | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface KBTemplateItem {
  type: 'faq' | 'services' | 'pricing' | 'policies';
  title: string;
  question?: string;
  answer: string;
}
