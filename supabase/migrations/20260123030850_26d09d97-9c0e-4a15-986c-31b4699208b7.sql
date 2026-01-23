-- =============================================================
-- SECURITY HARDENING: Block anonymous access to sensitive tables
-- =============================================================

-- 1. Block anonymous SELECT on profiles table
-- This prevents unauthenticated users from enumerating user profiles
CREATE POLICY "Block anonymous select on profiles"
ON public.profiles
FOR SELECT
TO anon
USING (false);

-- 2. Block anonymous SELECT on shift_assignment_locations
-- This is already blocked by existing policies, but adding explicit anon block
CREATE POLICY "Block anonymous select on shift_assignment_locations"
ON public.shift_assignment_locations
FOR SELECT
TO anon
USING (false);

-- 3. Block anonymous SELECT on profiles_private (already has blocks but ensuring complete coverage)
CREATE POLICY "Block anonymous select on profiles_private"
ON public.profiles_private
FOR SELECT
TO anon
USING (false);