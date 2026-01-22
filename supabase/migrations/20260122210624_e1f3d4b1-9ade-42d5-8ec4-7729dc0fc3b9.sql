-- Roles enum
CREATE TYPE public.app_role AS ENUM ('agency_admin', 'company_owner', 'company_staff');

-- Profiles table (synced with auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Companies table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive')),
  -- Business hours stored as JSONB
  business_hours JSONB DEFAULT '{"monday":{"open":"09:00","close":"17:00","closed":false},"tuesday":{"open":"09:00","close":"17:00","closed":false},"wednesday":{"open":"09:00","close":"17:00","closed":false},"thursday":{"open":"09:00","close":"17:00","closed":false},"friday":{"open":"09:00","close":"17:00","closed":false},"saturday":{"open":"09:00","close":"17:00","closed":true},"sunday":{"open":"09:00","close":"17:00","closed":true}}'::jsonb,
  holidays JSONB DEFAULT '[]'::jsonb,
  -- Contact routing
  primary_phone TEXT,
  fallback_phone TEXT,
  booking_link TEXT,
  -- AI Receptionist settings
  ai_greeting TEXT DEFAULT 'Hello! Thank you for calling. How may I help you today?',
  ai_disclosure TEXT DEFAULT 'Please note that you are speaking with an AI assistant.',
  ai_persona_prompt TEXT DEFAULT 'You are a friendly and professional receptionist.',
  ai_tone TEXT DEFAULT 'professional',
  ai_voice TEXT DEFAULT 'female',
  ai_language TEXT DEFAULT 'en-US',
  -- Allowed actions
  ai_allow_faq BOOLEAN DEFAULT true,
  ai_allow_booking BOOLEAN DEFAULT true,
  ai_allow_quote BOOLEAN DEFAULT false,
  ai_allow_reschedule BOOLEAN DEFAULT false,
  ai_allow_escalate BOOLEAN DEFAULT true,
  -- Escalation rules
  escalation_rules JSONB DEFAULT '{"escalateOnRequest":true,"escalateOnComplaint":true,"escalateAfterMinutes":5}'::jsonb,
  after_hours_behavior TEXT DEFAULT 'voicemail' CHECK (after_hours_behavior IN ('voicemail', 'message', 'forward')),
  after_hours_message TEXT DEFAULT 'We are currently closed. Please leave a message.',
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company memberships (links users to companies)
CREATE TABLE public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'company_staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Knowledge base items
CREATE TABLE public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('faq', 'service', 'pricing', 'policy')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Call logs
CREATE TABLE public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  caller_phone TEXT,
  caller_name TEXT,
  duration_seconds INTEGER DEFAULT 0,
  outcome TEXT CHECK (outcome IN ('answered', 'missed', 'voicemail', 'escalated')),
  escalated BOOLEAN DEFAULT false,
  booked BOOLEAN DEFAULT false,
  intent TEXT,
  transcript TEXT,
  summary TEXT,
  extracted_fields JSONB DEFAULT '{}'::jsonb,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team invitations
CREATE TABLE public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'company_staff',
  invited_by UUID REFERENCES auth.users(id),
  accepted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is member of company
CREATE OR REPLACE FUNCTION public.is_company_member(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Agency admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

-- Companies policies
CREATE POLICY "Agency admins can manage all companies" ON public.companies
  FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Company members can view their company" ON public.companies
  FOR SELECT USING (public.is_company_member(auth.uid(), id));

CREATE POLICY "Company owners can update their company" ON public.companies
  FOR UPDATE USING (
    public.is_company_member(auth.uid(), id) 
    AND EXISTS (
      SELECT 1 FROM public.company_members 
      WHERE company_id = id 
      AND user_id = auth.uid() 
      AND role IN ('company_owner', 'agency_admin')
    )
  );

-- Company members policies
CREATE POLICY "Agency admins can manage all memberships" ON public.company_members
  FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Members can view company members" ON public.company_members
  FOR SELECT USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company owners can manage members" ON public.company_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_id 
      AND cm.user_id = auth.uid() 
      AND cm.role = 'company_owner'
    )
  );

-- Knowledge base policies
CREATE POLICY "Members can view knowledge base" ON public.knowledge_base
  FOR SELECT USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Owners and admins can manage knowledge base" ON public.knowledge_base
  FOR ALL USING (
    public.has_role(auth.uid(), 'agency_admin')
    OR EXISTS (
      SELECT 1 FROM public.company_members 
      WHERE company_id = knowledge_base.company_id 
      AND user_id = auth.uid() 
      AND role IN ('company_owner', 'agency_admin')
    )
  );

-- Call logs policies
CREATE POLICY "Members can view call logs" ON public.call_logs
  FOR SELECT USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can add notes to call logs" ON public.call_logs
  FOR UPDATE USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Agency admins can manage all call logs" ON public.call_logs
  FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

-- Team invitations policies
CREATE POLICY "Company owners can manage invitations" ON public.team_invitations
  FOR ALL USING (
    public.has_role(auth.uid(), 'agency_admin')
    OR EXISTS (
      SELECT 1 FROM public.company_members 
      WHERE company_id = team_invitations.company_id 
      AND user_id = auth.uid() 
      AND role = 'company_owner'
    )
  );

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();