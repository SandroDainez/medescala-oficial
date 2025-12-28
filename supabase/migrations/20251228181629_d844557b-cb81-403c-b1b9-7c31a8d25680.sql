-- Harden public tables against unauthenticated reads (explicit deny for anon)

-- PROFILES
DROP POLICY IF EXISTS "Deny anon select" ON public.profiles;
CREATE POLICY "Deny anon select"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- PROFILES_PRIVATE
DROP POLICY IF EXISTS "Deny anon select" ON public.profiles_private;
CREATE POLICY "Deny anon select"
ON public.profiles_private
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- PAYMENTS
DROP POLICY IF EXISTS "Deny anon select" ON public.payments;
CREATE POLICY "Deny anon select"
ON public.payments
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- SHIFT_ASSIGNMENT_LOCATIONS
DROP POLICY IF EXISTS "Deny anon select" ON public.shift_assignment_locations;
CREATE POLICY "Deny anon select"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- SHIFTS
DROP POLICY IF EXISTS "Deny anon select" ON public.shifts;
CREATE POLICY "Deny anon select"
ON public.shifts
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);
