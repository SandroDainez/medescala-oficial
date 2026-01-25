
-- Drop the incorrectly configured permissive policy
DROP POLICY IF EXISTS "Block all anon access on shift_assignment_locations" ON public.shift_assignment_locations;

-- Create a RESTRICTIVE policy that properly blocks anonymous access
-- RESTRICTIVE policies are AND-ed together, so this will block anon even if other policies exist
CREATE POLICY "Block all anon access on shift_assignment_locations"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Also add a RESTRICTIVE policy requiring authentication for all operations
-- This provides defense-in-depth: requires auth.uid() IS NOT NULL for any access
CREATE POLICY "Require authentication for shift_assignment_locations"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
