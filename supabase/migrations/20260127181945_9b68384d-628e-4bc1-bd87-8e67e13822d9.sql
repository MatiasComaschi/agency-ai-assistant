-- Add database indexes for performance (Priority 3 - Performance)
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON public.calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_company_id ON public.calls(company_id);
CREATE INDEX IF NOT EXISTS idx_calls_company_started ON public.calls(company_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_audits_created_at ON public.audits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audits_company_id ON public.audits(company_id);

CREATE INDEX IF NOT EXISTS idx_appointments_company_id ON public.appointments(company_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_datetime ON public.appointments(start_datetime);

CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON public.system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_company_id ON public.system_events(company_id);

CREATE INDEX IF NOT EXISTS idx_usage_company_month ON public.usage(company_id, month);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_company_id ON public.knowledge_base_items(company_id);

-- Add agency_settings table for storing agency-level Twilio credentials
CREATE TABLE IF NOT EXISTS public.agency_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text,
  setting_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on agency_settings
ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;

-- Only agency admins can access agency settings
CREATE POLICY "Agency admins can manage agency settings"
  ON public.agency_settings FOR ALL
  USING (is_agency_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_agency_settings_updated_at
  BEFORE UPDATE ON public.agency_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();