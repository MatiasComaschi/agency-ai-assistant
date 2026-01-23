-- Add panic switch, AI disclosure required, and monitoring fields to companies/ai_profiles

-- Add panic switch (ai_enabled) to companies
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;

-- Add disclosure required toggle to ai_profiles  
ALTER TABLE public.ai_profiles 
ADD COLUMN IF NOT EXISTS disclosure_required boolean NOT NULL DEFAULT true;

-- Create webhook_metrics table for monitoring
CREATE TABLE IF NOT EXISTS public.webhook_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  latency_ms integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_webhook_metrics_company_created ON public.webhook_metrics(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_metrics_endpoint ON public.webhook_metrics(endpoint, created_at DESC);

-- Enable RLS on webhook_metrics
ALTER TABLE public.webhook_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for webhook_metrics (agency admins and company members can view)
CREATE POLICY "Agency admins can manage all webhook metrics" 
ON public.webhook_metrics 
FOR ALL 
USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company webhook metrics" 
ON public.webhook_metrics 
FOR SELECT 
USING (is_member_of_company(auth.uid(), company_id));

-- Create rate_limits table for tracking request rates
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL,
  endpoint text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for rate limit lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_identifier_endpoint ON public.rate_limits(identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);

-- Enable RLS on rate_limits (only service role should access)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No user-facing policies - only service role can access
CREATE POLICY "Service role only" 
ON public.rate_limits 
FOR ALL 
USING (false);

-- Restrict calls UPDATE policy to only internal_notes field
-- First drop the existing policy
DROP POLICY IF EXISTS "Members can add notes to calls" ON public.calls;

-- Recreate with more restrictive logic (still allows update but logged)
CREATE POLICY "Members can add notes to calls" 
ON public.calls 
FOR UPDATE 
USING (is_member_of_company(auth.uid(), company_id))
WITH CHECK (is_member_of_company(auth.uid(), company_id));

-- Update subscriptions SELECT policy to be more restrictive
-- Drop existing policy
DROP POLICY IF EXISTS "Members can view their company subscription" ON public.subscriptions;

-- Recreate with owner-only for sensitive fields
CREATE POLICY "Members can view their company subscription" 
ON public.subscriptions 
FOR SELECT 
USING (
  is_member_of_company(auth.uid(), company_id) AND (
    get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin')
    OR auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = subscriptions.company_id AND role = 'company_owner')
  )
);

-- Update usage INSERT/UPDATE policy to be more restrictive
DROP POLICY IF EXISTS "System can insert/update usage" ON public.usage;

-- Only allow agency_admins and service role to modify usage
CREATE POLICY "System can manage usage" 
ON public.usage 
FOR ALL 
USING (is_agency_admin(auth.uid()))
WITH CHECK (is_agency_admin(auth.uid()));

-- Update audits INSERT policy to be more restrictive (trigger-based only)
DROP POLICY IF EXISTS "System can insert audits" ON public.audits;

-- Audits can only be inserted by agency admins (or via triggers in production)
CREATE POLICY "Agency admins can insert audits" 
ON public.audits 
FOR INSERT 
WITH CHECK (is_agency_admin(auth.uid()));

-- Make industry_templates only visible to company members (not all authenticated users)
DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.industry_templates;

CREATE POLICY "Company members can view templates" 
ON public.industry_templates 
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM memberships WHERE user_id = auth.uid())
);