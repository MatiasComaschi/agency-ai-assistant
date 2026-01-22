-- Create integrations table for per-company connectors
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  config_json JSONB DEFAULT '{}'::jsonb,
  connected_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider)
);

-- Enable RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Agency admins can manage all integrations
CREATE POLICY "Agency admins can manage all integrations"
ON public.integrations
FOR ALL
USING (is_agency_admin(auth.uid()));

-- Members can view their company integrations
CREATE POLICY "Members can view their company integrations"
ON public.integrations
FOR SELECT
USING (is_member_of_company(auth.uid(), company_id));

-- Owners can manage their company integrations
CREATE POLICY "Owners can manage their company integrations"
ON public.integrations
FOR ALL
USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

-- Trigger for updated_at
CREATE TRIGGER update_integrations_updated_at
BEFORE UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_integrations_company_id ON public.integrations(company_id);
CREATE INDEX idx_integrations_provider ON public.integrations(provider);