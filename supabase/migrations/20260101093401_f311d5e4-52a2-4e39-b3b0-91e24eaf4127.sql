-- Force RLS on absences and tenants
ALTER TABLE public.absences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

-- Add explicit block-all policies for anon role on each table
-- These ensure anonymous users cannot access ANY operation

-- profiles: block all anon operations
DROP POLICY IF EXISTS "Block anon select on profiles" ON public.profiles;
CREATE POLICY "Block all anon access on profiles" 
ON public.profiles 
FOR ALL 
TO anon 
USING (false)
WITH CHECK (false);

-- payments: block all anon operations
DROP POLICY IF EXISTS "Block anon select on payments" ON public.payments;
CREATE POLICY "Block all anon access on payments" 
ON public.payments 
FOR ALL 
TO anon 
USING (false)
WITH CHECK (false);

-- shift_assignment_locations: block all anon operations
DROP POLICY IF EXISTS "Block anon select on shift_assignment_locations" ON public.shift_assignment_locations;
CREATE POLICY "Block all anon access on shift_assignment_locations" 
ON public.shift_assignment_locations 
FOR ALL 
TO anon 
USING (false)
WITH CHECK (false);

-- shifts: block all anon operations
CREATE POLICY "Block all anon access on shifts" 
ON public.shifts 
FOR ALL 
TO anon 
USING (false)
WITH CHECK (false);

-- tenants: block all anon operations
CREATE POLICY "Block all anon access on tenants" 
ON public.tenants 
FOR ALL 
TO anon 
USING (false)
WITH CHECK (false);

-- absences: block all anon operations
CREATE POLICY "Block all anon access on absences" 
ON public.absences 
FOR ALL 
TO anon 
USING (false)
WITH CHECK (false);