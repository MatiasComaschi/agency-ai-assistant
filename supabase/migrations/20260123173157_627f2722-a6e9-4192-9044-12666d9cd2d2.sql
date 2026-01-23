-- Add referral codes table
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  referred_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'expired')),
  reward_cents INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  converted_at TIMESTAMP WITH TIME ZONE
);

-- Add testimonials table
CREATE TABLE public.testimonials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_title TEXT,
  content TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE
);

-- Add white-label settings table
CREATE TABLE public.white_label_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#8B5CF6',
  secondary_color TEXT DEFAULT '#0EA5E9',
  assistant_name TEXT DEFAULT 'AI Assistant',
  custom_domain TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.white_label_settings ENABLE ROW LEVEL SECURITY;

-- Referral policies
CREATE POLICY "Agency admins can manage all referrals"
  ON public.referrals FOR ALL
  USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company referrals"
  ON public.referrals FOR SELECT
  USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company referrals"
  ON public.referrals FOR ALL
  USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

-- Testimonial policies
CREATE POLICY "Agency admins can manage all testimonials"
  ON public.testimonials FOR ALL
  USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company testimonials"
  ON public.testimonials FOR SELECT
  USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company testimonials"
  ON public.testimonials FOR ALL
  USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

CREATE POLICY "Public testimonials are viewable by all"
  ON public.testimonials FOR SELECT
  USING (is_public = true AND is_approved = true);

-- White-label policies
CREATE POLICY "Agency admins can manage all white-label settings"
  ON public.white_label_settings FOR ALL
  USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company white-label settings"
  ON public.white_label_settings FOR SELECT
  USING (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Owners can manage their company white-label settings"
  ON public.white_label_settings FOR ALL
  USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

-- Add triggers for updated_at
CREATE TRIGGER update_white_label_settings_updated_at
  BEFORE UPDATE ON public.white_label_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Generate unique referral code function
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;