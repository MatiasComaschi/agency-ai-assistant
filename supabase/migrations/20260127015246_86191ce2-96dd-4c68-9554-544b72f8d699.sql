-- ====================================================================
-- HARDENING MIGRATION: Idempotent platform_settings + RLS WITH CHECK
-- ====================================================================

-- A1) Ensure platform_settings has a row (idempotent)
INSERT INTO public.platform_settings (id, core_prompt, core_prompt_version)
VALUES (
  1,
  'You are an AI receptionist. Your role is strictly business-focused: answer questions about the company''s services, handle booking requests, and provide information from the knowledge base.

RULES:
1) Never discuss topics outside the business scope - politely redirect off-topic conversations.
2) Never invent or hallucinate prices, services, or availability - only use information from the knowledge base.
3) Never confirm a booking until the backend system confirms success.
4) Always be professional, concise, and helpful.',
  '1.0.0'
)
ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- A2) Drop and recreate owner-write policies WITH both USING and WITH CHECK
-- ====================================================================

-- STAFF table
DROP POLICY IF EXISTS "Owners can manage their company staff" ON public.staff;
CREATE POLICY "Owners can manage their company staff"
ON public.staff
FOR ALL
USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'))
WITH CHECK (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

-- SERVICES table
DROP POLICY IF EXISTS "Owners can manage their company services" ON public.services;
CREATE POLICY "Owners can manage their company services"
ON public.services
FOR ALL
USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'))
WITH CHECK (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

-- APPOINTMENTS table
DROP POLICY IF EXISTS "Owners can manage their company appointments" ON public.appointments;
CREATE POLICY "Owners can manage their company appointments"
ON public.appointments
FOR ALL
USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'))
WITH CHECK (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

-- CALENDAR_CONNECTIONS table
DROP POLICY IF EXISTS "Owners can manage their company calendar_connections" ON public.calendar_connections;
CREATE POLICY "Owners can manage their company calendar_connections"
ON public.calendar_connections
FOR ALL
USING (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'))
WITH CHECK (get_user_role_in_company(auth.uid(), company_id) IN ('company_owner', 'agency_admin'));

-- STAFF_HOURS table (uses staff.company_id via subquery)
DROP POLICY IF EXISTS "Owners can manage their company staff_hours" ON public.staff_hours;
CREATE POLICY "Owners can manage their company staff_hours"
ON public.staff_hours
FOR ALL
USING (EXISTS (
  SELECT 1 FROM staff s
  WHERE s.id = staff_hours.staff_id
  AND get_user_role_in_company(auth.uid(), s.company_id) IN ('company_owner', 'agency_admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM staff s
  WHERE s.id = staff_hours.staff_id
  AND get_user_role_in_company(auth.uid(), s.company_id) IN ('company_owner', 'agency_admin')
));

-- STAFF_TIME_OFF table (uses staff.company_id via subquery)
DROP POLICY IF EXISTS "Owners can manage their company staff_time_off" ON public.staff_time_off;
CREATE POLICY "Owners can manage their company staff_time_off"
ON public.staff_time_off
FOR ALL
USING (EXISTS (
  SELECT 1 FROM staff s
  WHERE s.id = staff_time_off.staff_id
  AND get_user_role_in_company(auth.uid(), s.company_id) IN ('company_owner', 'agency_admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM staff s
  WHERE s.id = staff_time_off.staff_id
  AND get_user_role_in_company(auth.uid(), s.company_id) IN ('company_owner', 'agency_admin')
));

-- SERVICE_STAFF table (uses services.company_id via subquery)
DROP POLICY IF EXISTS "Owners can manage their company service_staff" ON public.service_staff;
CREATE POLICY "Owners can manage their company service_staff"
ON public.service_staff
FOR ALL
USING (EXISTS (
  SELECT 1 FROM services s
  WHERE s.id = service_staff.service_id
  AND get_user_role_in_company(auth.uid(), s.company_id) IN ('company_owner', 'agency_admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM services s
  WHERE s.id = service_staff.service_id
  AND get_user_role_in_company(auth.uid(), s.company_id) IN ('company_owner', 'agency_admin')
));