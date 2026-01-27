-- Fix overly permissive RLS policies on invite tables
-- These policies currently allow any authenticated user to enumerate all tokens

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Anyone can view invite by token" ON public.company_invites;
DROP POLICY IF EXISTS "Anyone can view trial invite by token" ON public.trial_invites;

-- Create restrictive policies that still allow the accept-invite flows to work
-- The edge functions use service role key, so they bypass RLS
-- Unauthenticated users viewing invites goes through the edge function
-- This policy only allows authenticated users to see their own company's invites
CREATE POLICY "Users can view invites for their company only"
ON public.company_invites
FOR SELECT
USING (
  is_agency_admin(auth.uid()) 
  OR is_member_of_company(auth.uid(), company_id)
  OR get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin')
);

-- For trial_invites, only agency admins should be able to view them
-- The accept flow uses service role key in edge function
CREATE POLICY "Agency admins can view trial invites"
ON public.trial_invites
FOR SELECT
USING (is_agency_admin(auth.uid()));