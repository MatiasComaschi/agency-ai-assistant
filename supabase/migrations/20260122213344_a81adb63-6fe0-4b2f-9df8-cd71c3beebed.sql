
-- Drop existing tables and recreate with new schema
-- First drop dependent policies and tables

-- Drop old RLS policies
DROP POLICY IF EXISTS "Agency admins can manage all call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Members can add notes to call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Members can view call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Agency admins can manage all companies" ON public.companies;
DROP POLICY IF EXISTS "Company members can view their company" ON public.companies;
DROP POLICY IF EXISTS "Company owners can update their company" ON public.companies;
DROP POLICY IF EXISTS "Agency admins can manage all memberships" ON public.company_members;
DROP POLICY IF EXISTS "Company owners can manage members" ON public.company_members;
DROP POLICY IF EXISTS "Members can view company members" ON public.company_members;
DROP POLICY IF EXISTS "Members can view knowledge base" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owners and admins can manage knowledge base" ON public.knowledge_base;
DROP POLICY IF EXISTS "Company owners can manage invitations" ON public.team_invitations;

-- Drop old tables
DROP TABLE IF EXISTS public.call_logs CASCADE;
DROP TABLE IF EXISTS public.knowledge_base CASCADE;
DROP TABLE IF EXISTS public.team_invitations CASCADE;
DROP TABLE IF EXISTS public.company_members CASCADE;

-- Create memberships table (replaces company_members)
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'company_staff' CHECK (role IN ('agency_admin', 'company_owner', 'company_staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- Update companies table with new columns
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS twilio_number text UNIQUE,
  DROP COLUMN IF EXISTS ai_greeting,
  DROP COLUMN IF EXISTS ai_disclosure,
  DROP COLUMN IF EXISTS ai_persona_prompt,
  DROP COLUMN IF EXISTS ai_tone,
  DROP COLUMN IF EXISTS ai_voice,
  DROP COLUMN IF EXISTS ai_language,
  DROP COLUMN IF EXISTS ai_allow_faq,
  DROP COLUMN IF EXISTS ai_allow_booking,
  DROP COLUMN IF EXISTS ai_allow_quote,
  DROP COLUMN IF EXISTS ai_allow_reschedule,
  DROP COLUMN IF EXISTS ai_allow_escalate,
  DROP COLUMN IF EXISTS escalation_rules,
  DROP COLUMN IF EXISTS after_hours_behavior,
  DROP COLUMN IF EXISTS after_hours_message,
  DROP COLUMN IF EXISTS business_hours,
  DROP COLUMN IF EXISTS holidays;

-- Create company_hours table
CREATE TABLE public.company_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time text NOT NULL DEFAULT '09:00',
  close_time text NOT NULL DEFAULT '17:00',
  is_closed boolean NOT NULL DEFAULT false,
  UNIQUE(company_id, day_of_week)
);

-- Create company_holidays table
CREATE TABLE public.company_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT true,
  note text,
  UNIQUE(company_id, date)
);

-- Create ai_profiles table
CREATE TABLE public.ai_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  system_prompt text DEFAULT 'You are a friendly and professional receptionist.',
  tone text DEFAULT 'professional',
  language text DEFAULT 'en-US',
  voice_id text DEFAULT 'female',
  greeting_script text DEFAULT 'Hello! Thank you for calling. How may I help you today?',
  disclosure_script text DEFAULT 'Please note that you are speaking with an AI assistant.',
  after_hours_script text DEFAULT 'We are currently closed. Please leave a message.',
  allowed_actions_json jsonb DEFAULT '{"faq": true, "booking": true, "quote": false, "reschedule": false, "escalate": true}'::jsonb,
  escalation_rules_json jsonb DEFAULT '{"escalateOnRequest": true, "escalateOnComplaint": true, "escalateAfterMinutes": 5}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create knowledge_base_items table
CREATE TABLE public.knowledge_base_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'faq' CHECK (type IN ('faq', 'services', 'pricing', 'policies')),
  title text NOT NULL,
  question text,
  answer text NOT NULL,
  tags text[] DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create calls table
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  caller_number text,
  caller_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  outcome text CHECK (outcome IN ('answered', 'escalated', 'booked', 'voicemail', 'abandoned')),
  transcript text,
  summary text,
  extracted_json jsonb DEFAULT '{}'::jsonb,
  recording_url text,
  cost_cents int DEFAULT 0,
  internal_notes text
);

-- Create followup_tasks table
CREATE TABLE public.followup_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  assigned_to uuid,
  title text NOT NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create audits table
CREATE TABLE public.audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create helper function is_agency_admin
CREATE OR REPLACE FUNCTION public.is_agency_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = _user_id AND role = 'agency_admin'
  )
$$;

-- Create helper function is_member_of_company
CREATE OR REPLACE FUNCTION public.is_member_of_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

-- Create helper function get_user_role_in_company
CREATE OR REPLACE FUNCTION public.get_user_role_in_company(_user_id uuid, _company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.memberships
  WHERE user_id = _user_id AND company_id = _company_id
  LIMIT 1
$$;

-- Enable RLS on all tables
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memberships
CREATE POLICY "Agency admins can manage all memberships"
ON public.memberships FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Company owners can manage their company memberships"
ON public.memberships FOR ALL
USING (
  get_user_role_in_company(auth.uid(), company_id) = 'company_owner'
);

CREATE POLICY "Members can view their company memberships"
ON public.memberships FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

-- RLS Policies for companies
CREATE POLICY "Agency admins can manage all companies"
ON public.companies FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company"
ON public.companies FOR SELECT
USING (is_member_of_company(auth.uid(), id));

CREATE POLICY "Company owners can update their company"
ON public.companies FOR UPDATE
USING (
  get_user_role_in_company(auth.uid(), id) IN ('company_owner', 'agency_admin')
);

-- RLS Policies for company_hours
CREATE POLICY "Agency admins can manage all company hours"
ON public.company_hours FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company hours"
ON public.company_hours FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company hours"
ON public.company_hours FOR ALL
USING (
  get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin')
);

-- RLS Policies for company_holidays
CREATE POLICY "Agency admins can manage all holidays"
ON public.company_holidays FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company holidays"
ON public.company_holidays FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company holidays"
ON public.company_holidays FOR ALL
USING (
  get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin')
);

-- RLS Policies for ai_profiles
CREATE POLICY "Agency admins can manage all AI profiles"
ON public.ai_profiles FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company AI profile"
ON public.ai_profiles FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company AI profile"
ON public.ai_profiles FOR ALL
USING (
  get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin')
);

-- RLS Policies for knowledge_base_items
CREATE POLICY "Agency admins can manage all KB items"
ON public.knowledge_base_items FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company KB items"
ON public.knowledge_base_items FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company KB items"
ON public.knowledge_base_items FOR ALL
USING (
  get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin')
);

-- RLS Policies for calls
CREATE POLICY "Agency admins can manage all calls"
ON public.calls FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company calls"
ON public.calls FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Members can add notes to calls"
ON public.calls FOR UPDATE
USING (is_member_of_company(auth.uid(), company_id));

-- RLS Policies for followup_tasks
CREATE POLICY "Agency admins can manage all tasks"
ON public.followup_tasks FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company tasks"
ON public.followup_tasks FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Members can manage their company tasks"
ON public.followup_tasks FOR ALL
USING (is_member_of_company(auth.uid(), company_id));

-- RLS Policies for audits
CREATE POLICY "Agency admins can view all audits"
ON public.audits FOR SELECT
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company audits"
ON public.audits FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "System can insert audits"
ON public.audits FOR INSERT
WITH CHECK (is_member_of_company(auth.uid(), company_id));

-- Create triggers for updated_at
CREATE TRIGGER update_ai_profiles_updated_at
BEFORE UPDATE ON public.ai_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_knowledge_base_items_updated_at
BEFORE UPDATE ON public.knowledge_base_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX idx_memberships_company_id ON public.memberships(company_id);
CREATE INDEX idx_calls_company_id ON public.calls(company_id);
CREATE INDEX idx_calls_started_at ON public.calls(started_at);
CREATE INDEX idx_knowledge_base_items_company_id ON public.knowledge_base_items(company_id);
CREATE INDEX idx_followup_tasks_company_id ON public.followup_tasks(company_id);
CREATE INDEX idx_audits_company_id ON public.audits(company_id);
