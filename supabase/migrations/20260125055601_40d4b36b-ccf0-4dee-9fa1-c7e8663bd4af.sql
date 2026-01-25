
-- Re-apply RESTRICTIVE policies for tables that still have PERMISSIVE "Block" policies

-- 1) PAYMENTS - Drop PERMISSIVE and create RESTRICTIVE
DROP POLICY IF EXISTS "Block all anon access on payments" ON public.payments;
DROP POLICY IF EXISTS "Require authentication for payments" ON public.payments;

CREATE POLICY "Block all anon access on payments"
ON public.payments
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Require authentication for payments"
ON public.payments
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 2) PROFILES - Drop PERMISSIVE and create RESTRICTIVE
DROP POLICY IF EXISTS "Block all anon access on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Require authentication for profiles" ON public.profiles;

CREATE POLICY "Block all anon access on profiles"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Require authentication for profiles"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 3) SHIFTS - Drop PERMISSIVE and create RESTRICTIVE
DROP POLICY IF EXISTS "Block all anon access on shifts" ON public.shifts;
DROP POLICY IF EXISTS "Require authentication for shifts" ON public.shifts;

CREATE POLICY "Block all anon access on shifts"
ON public.shifts
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Require authentication for shifts"
ON public.shifts
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 4) TENANTS - Drop PERMISSIVE and create RESTRICTIVE
DROP POLICY IF EXISTS "Block all anon access on tenants" ON public.tenants;
DROP POLICY IF EXISTS "Require authentication for tenants" ON public.tenants;

CREATE POLICY "Block all anon access on tenants"
ON public.tenants
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Require authentication for tenants"
ON public.tenants
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 5) ABSENCES - Drop PERMISSIVE and create RESTRICTIVE
DROP POLICY IF EXISTS "Block all anon access on absences" ON public.absences;
DROP POLICY IF EXISTS "Require authentication for absences" ON public.absences;

CREATE POLICY "Block all anon access on absences"
ON public.absences
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Require authentication for absences"
ON public.absences
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
