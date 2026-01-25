
-- Fix: Change "Authorized users can view profiles" from RESTRICTIVE to PERMISSIVE
-- The RESTRICTIVE policy was blocking admins because it requires BOTH:
-- 1. can_view_profile(id) = true (RESTRICTIVE)
-- 2. auth.uid() = id (from one of the PERMISSIVE policies)
-- 
-- This means admins could never see other profiles because they don't satisfy #2

DROP POLICY IF EXISTS "Authorized users can view profiles" ON public.profiles;

CREATE POLICY "Authorized users can view profiles" 
ON public.profiles
FOR SELECT
USING (can_view_profile(id));

-- Note: This is now PERMISSIVE (default), so it works as an OR with other SELECT policies
-- Users can see profiles if: their own profile OR can_view_profile returns true
