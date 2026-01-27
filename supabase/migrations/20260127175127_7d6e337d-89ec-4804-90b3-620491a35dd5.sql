-- Create trial_invites table for tracking free trial invitations
CREATE TABLE public.trial_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  company_name text NOT NULL,
  plan text NOT NULL DEFAULT 'starter',
  trial_days integer NOT NULL DEFAULT 14,
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by uuid NOT NULL,
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(token)
);

-- Enable RLS
ALTER TABLE public.trial_invites ENABLE ROW LEVEL SECURITY;

-- Agency admins can manage all trial invites
CREATE POLICY "Agency admins can manage all trial invites"
ON public.trial_invites FOR ALL
USING (is_agency_admin(auth.uid()));

-- Anyone can view invite by token (for accepting)
CREATE POLICY "Anyone can view trial invite by token"
ON public.trial_invites FOR SELECT
USING (true);