-- Phase 2: Support tickets table
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Ticket comments
CREATE TABLE public.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- System events for failure tracking
CREATE TABLE public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('error', 'warning', 'info', 'call_failure', 'stream_failure', 'dial_failure', 'edge_function_error')),
  source text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Company invites for user management
CREATE TABLE public.company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'company_staff' CHECK (role IN ('company_owner', 'company_staff')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid NOT NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

-- RLS for support_tickets
CREATE POLICY "Agency admins can manage all tickets" ON public.support_tickets
  FOR ALL USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can create tickets for their company" ON public.support_tickets
  FOR INSERT WITH CHECK (is_member_of_company(auth.uid(), company_id));

CREATE POLICY "Members can view their company tickets" ON public.support_tickets
  FOR SELECT USING (is_member_of_company(auth.uid(), company_id));

-- RLS for ticket_comments
CREATE POLICY "Agency admins can manage all comments" ON public.ticket_comments
  FOR ALL USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can add comments to their company tickets" ON public.ticket_comments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.support_tickets t 
            WHERE t.id = ticket_id AND is_member_of_company(auth.uid(), t.company_id))
  );

CREATE POLICY "Members can view comments on their company tickets" ON public.ticket_comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_tickets t 
            WHERE t.id = ticket_id AND is_member_of_company(auth.uid(), t.company_id))
  );

-- RLS for system_events
CREATE POLICY "Agency admins can manage all events" ON public.system_events
  FOR ALL USING (is_agency_admin(auth.uid()));

CREATE POLICY "Members can view their company events" ON public.system_events
  FOR SELECT USING (company_id IS NULL OR is_member_of_company(auth.uid(), company_id));

-- RLS for company_invites
CREATE POLICY "Agency admins can manage all invites" ON public.company_invites
  FOR ALL USING (is_agency_admin(auth.uid()));

CREATE POLICY "Owners can manage their company invites" ON public.company_invites
  FOR ALL USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

CREATE POLICY "Anyone can view invite by token" ON public.company_invites
  FOR SELECT USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_support_tickets_company ON public.support_tickets(company_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_system_events_company ON public.system_events(company_id);
CREATE INDEX idx_system_events_type ON public.system_events(event_type);
CREATE INDEX idx_company_invites_token ON public.company_invites(token);
CREATE INDEX idx_company_invites_company ON public.company_invites(company_id);