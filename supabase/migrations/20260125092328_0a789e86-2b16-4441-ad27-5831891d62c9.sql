-- =============================================================================
-- HARDENING: Zero anonymous access on sensitive tables
-- Tables: payments, shift_assignment_locations, profiles_private
-- =============================================================================

-- 1) REVOKE all permissions from anon role
REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.shift_assignment_locations FROM anon;
REVOKE ALL ON public.profiles_private FROM anon;

-- 2) Ensure RLS is enabled AND forced (bypasses superuser for these tables)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shift_assignment_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignment_locations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_private FORCE ROW LEVEL SECURITY;

-- 3) Verify/recreate RESTRICTIVE policies blocking anon (idempotent)
-- These policies already exist but we ensure they're properly configured

-- payments: Block anon
DROP POLICY IF EXISTS "Block anon access on payments" ON public.payments;
CREATE POLICY "Block anon access on payments"
ON public.payments
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- shift_assignment_locations: Block anon
DROP POLICY IF EXISTS "Block anon access on shift_assignment_locations" ON public.shift_assignment_locations;
CREATE POLICY "Block anon access on shift_assignment_locations"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- profiles_private: Block anon
DROP POLICY IF EXISTS "Block anon access on profiles_private" ON public.profiles_private;
CREATE POLICY "Block anon access on profiles_private"
ON public.profiles_private
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 4) Add comments documenting the security posture
COMMENT ON TABLE public.payments IS 'Financial data - RLS forced, anon revoked, RESTRICTIVE block policy';
COMMENT ON TABLE public.shift_assignment_locations IS 'GPS location data - RLS forced, anon revoked, RESTRICTIVE block policy';
COMMENT ON TABLE public.profiles_private IS 'Encrypted PII - RLS forced, anon revoked, RESTRICTIVE block policy';