-- Fix profiles_private RLS policies for defense-in-depth
-- Problem: All policies are RESTRICTIVE which requires at least one PERMISSIVE policy to work
-- Solution: Convert legitimate access policies to PERMISSIVE (default type) which properly grants access

-- First, drop all existing policies on profiles_private
DROP POLICY IF EXISTS "Owner can view own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Owner can insert own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Owner can update own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Owner can delete own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Super admins can view private profiles" ON public.profiles_private;
DROP POLICY IF EXISTS "Block all anonymous access to profiles_private" ON public.profiles_private;
DROP POLICY IF EXISTS "Block anonymous inserts to profiles_private" ON public.profiles_private;
DROP POLICY IF EXISTS "Block anonymous select on profiles_private" ON public.profiles_private;

-- Recreate as PERMISSIVE policies (default - no AS RESTRICTIVE clause)
-- These policies ONLY allow access to authenticated users who meet the conditions
-- Anonymous users (auth.uid() IS NULL) will be denied by the auth.uid() IS NOT NULL check

-- Owner can view their own private profile
CREATE POLICY "Owner can view own private profile"
ON public.profiles_private
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND tenant_id IS NOT NULL
);

-- Owner can insert their own private profile
CREATE POLICY "Owner can insert own private profile"
ON public.profiles_private
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND tenant_id IS NOT NULL
);

-- Owner can update their own private profile
CREATE POLICY "Owner can update own private profile"
ON public.profiles_private
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND tenant_id IS NOT NULL
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND tenant_id IS NOT NULL
);

-- Owner can delete their own private profile
CREATE POLICY "Owner can delete own private profile"
ON public.profiles_private
FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);

-- Super admins can view all private profiles (for support/audit)
CREATE POLICY "Super admins can view private profiles"
ON public.profiles_private
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND is_super_admin(auth.uid())
);

-- Tenant admins can view private profiles in their tenant (for payroll/management)
CREATE POLICY "Tenant admins can view private profiles in tenant"
ON public.profiles_private
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND tenant_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.user_id = auth.uid()
    AND memberships.tenant_id = profiles_private.tenant_id
    AND memberships.role = 'admin'
    AND memberships.active = true
  )
);