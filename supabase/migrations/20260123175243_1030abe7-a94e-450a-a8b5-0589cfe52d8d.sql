-- Update is_agency_admin to check user_roles instead of memberships
-- This makes agency_admin a GLOBAL role that doesn't depend on company membership

CREATE OR REPLACE FUNCTION public.is_agency_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'agency_admin'
  )
$function$;

-- Grant agency admins ability to read all profiles for admin management
CREATE POLICY "Agency admins can view all profiles"
ON public.profiles
FOR SELECT
USING (is_agency_admin(auth.uid()));

-- Allow agency admins to insert user_roles for granting agency_admin
DROP POLICY IF EXISTS "Agency admins can manage roles" ON public.user_roles;
CREATE POLICY "Agency admins can manage all roles"
ON public.user_roles
FOR ALL
USING (is_agency_admin(auth.uid()))
WITH CHECK (is_agency_admin(auth.uid()));

-- Keep the user can view own roles policy
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);