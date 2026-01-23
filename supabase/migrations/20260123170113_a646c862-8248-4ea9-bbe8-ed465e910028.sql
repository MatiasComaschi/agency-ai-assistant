-- Create subscriptions table for tracking company billing
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'inactive',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  calls_limit INTEGER NOT NULL DEFAULT 100,
  minutes_limit INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_company_subscription UNIQUE (company_id)
);

-- Create usage table for tracking monthly consumption
CREATE TABLE public.usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  calls_count INTEGER NOT NULL DEFAULT 0,
  minutes_count INTEGER NOT NULL DEFAULT 0,
  overage_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_company_month UNIQUE (company_id, month)
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;

-- Subscriptions RLS policies
CREATE POLICY "Agency admins can manage all subscriptions"
  ON public.subscriptions
  FOR ALL
  USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company subscription"
  ON public.subscriptions
  FOR SELECT
  USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company subscription"
  ON public.subscriptions
  FOR ALL
  USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

-- Usage RLS policies
CREATE POLICY "Agency admins can manage all usage"
  ON public.usage
  FOR ALL
  USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company usage"
  ON public.usage
  FOR SELECT
  USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "System can insert/update usage"
  ON public.usage
  FOR ALL
  USING (is_member_of_company(auth.uid(), company_id));

-- Add updated_at triggers
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_usage_updated_at
  BEFORE UPDATE ON public.usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();