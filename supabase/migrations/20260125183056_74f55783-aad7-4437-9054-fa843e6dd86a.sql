
-- FIX CRITICAL RLS BUG: Block anon access policies are blocking ALL users!
-- The policy "Block anon access on shifts" uses USING (false) which blocks EVERYONE

-- Drop the broken policies on shifts
DROP POLICY IF EXISTS "Block anon access on shifts" ON public.shifts;

-- Create a proper policy that only blocks anonymous users
CREATE POLICY "Block anon access on shifts"
ON public.shifts
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Do the same fix for shift_assignments
DROP POLICY IF EXISTS "Block anon access on shift_assignments" ON public.shift_assignments;

CREATE POLICY "Block anon access on shift_assignments"
ON public.shift_assignments
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
