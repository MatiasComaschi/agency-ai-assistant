-- =============================================
-- FEATURE 1: Platform Settings (Dev-locked Core Prompt)
-- =============================================
CREATE TABLE public.platform_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Single row enforcement
  core_prompt text NOT NULL DEFAULT 'You are an AI receptionist. Your role is strictly business-focused: answer questions about the company''s services, handle booking requests, and provide information from the knowledge base. RULES: 1) Never discuss topics outside the business scope - politely redirect off-topic conversations. 2) Never invent or hallucinate prices, services, or availability - only use information from the knowledge base. 3) Never confirm a booking until the backend system confirms success. 4) Always be professional, concise, and helpful.',
  core_prompt_version text NOT NULL DEFAULT '1.0.0',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO public.platform_settings (id, core_prompt, core_prompt_version)
VALUES (1, 'You are an AI receptionist. Your role is strictly business-focused: answer questions about the company''s services, handle booking requests, and provide information from the knowledge base. RULES: 1) Never discuss topics outside the business scope - politely redirect off-topic conversations. 2) Never invent or hallucinate prices, services, or availability - only use information from the knowledge base. 3) Never confirm a booking until the backend system confirms success. 4) Always be professional, concise, and helpful.', '1.0.0');

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Only agency_admin can access platform_settings
CREATE POLICY "Agency admins can manage platform settings"
ON public.platform_settings
FOR ALL
USING (is_agency_admin(auth.uid()));

-- =============================================
-- FEATURE 2: Staff Management
-- =============================================
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency admins can manage all staff"
ON public.staff FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company staff"
ON public.staff FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company staff"
ON public.staff FOR ALL
USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

CREATE INDEX idx_staff_company_id ON public.staff(company_id);

-- =============================================
-- FEATURE 2: Services Management
-- =============================================
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  price numeric,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency admins can manage all services"
ON public.services FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company services"
ON public.services FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company services"
ON public.services FOR ALL
USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

CREATE INDEX idx_services_company_id ON public.services(company_id);

-- =============================================
-- FEATURE 2: Service-Staff Mapping
-- =============================================
CREATE TABLE public.service_staff (
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, staff_id)
);

ALTER TABLE public.service_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency admins can manage all service_staff"
ON public.service_staff FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company service_staff"
ON public.service_staff FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.services s 
  WHERE s.id = service_id AND is_member_of_company(auth.uid(), s.company_id)
));

CREATE POLICY "Owners can manage their company service_staff"
ON public.service_staff FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.services s 
  WHERE s.id = service_id AND get_user_role_in_company(auth.uid(), s.company_id) IN ('company_owner', 'agency_admin')
));

-- =============================================
-- FEATURE 2: Staff Working Hours
-- =============================================
CREATE TABLE public.staff_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '17:00',
  UNIQUE (staff_id, day_of_week)
);

ALTER TABLE public.staff_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency admins can manage all staff_hours"
ON public.staff_hours FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company staff_hours"
ON public.staff_hours FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.staff s 
  WHERE s.id = staff_id AND is_member_of_company(auth.uid(), s.company_id)
));

CREATE POLICY "Owners can manage their company staff_hours"
ON public.staff_hours FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.staff s 
  WHERE s.id = staff_id AND get_user_role_in_company(auth.uid(), s.company_id) IN ('company_owner', 'agency_admin')
));

CREATE INDEX idx_staff_hours_staff_id ON public.staff_hours(staff_id);

-- =============================================
-- FEATURE 2: Staff Time Off
-- =============================================
CREATE TABLE public.staff_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency admins can manage all staff_time_off"
ON public.staff_time_off FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company staff_time_off"
ON public.staff_time_off FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.staff s 
  WHERE s.id = staff_id AND is_member_of_company(auth.uid(), s.company_id)
));

CREATE POLICY "Owners can manage their company staff_time_off"
ON public.staff_time_off FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.staff s 
  WHERE s.id = staff_id AND get_user_role_in_company(auth.uid(), s.company_id) IN ('company_owner', 'agency_admin')
));

CREATE INDEX idx_staff_time_off_staff_id ON public.staff_time_off(staff_id);

-- =============================================
-- FEATURE 2: Appointments
-- =============================================
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('phone', 'web')),
  external_event_id text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'canceled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency admins can manage all appointments"
ON public.appointments FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company appointments"
ON public.appointments FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company appointments"
ON public.appointments FOR ALL
USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

CREATE INDEX idx_appointments_company_id ON public.appointments(company_id);
CREATE INDEX idx_appointments_staff_id ON public.appointments(staff_id);
CREATE INDEX idx_appointments_start_datetime ON public.appointments(start_datetime);

-- =============================================
-- FEATURE 3: Calendar Connections
-- =============================================
CREATE TABLE public.calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  provider text NOT NULL CHECK (provider IN ('google', 'calendly', 'outlook')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  config_json jsonb DEFAULT '{}'::jsonb,
  connected_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency admins can manage all calendar_connections"
ON public.calendar_connections FOR ALL
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company calendar_connections"
ON public.calendar_connections FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company calendar_connections"
ON public.calendar_connections FOR ALL
USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

CREATE INDEX idx_calendar_connections_company_id ON public.calendar_connections(company_id);

-- =============================================
-- Triggers for updated_at
-- =============================================
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_connections_updated_at
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();