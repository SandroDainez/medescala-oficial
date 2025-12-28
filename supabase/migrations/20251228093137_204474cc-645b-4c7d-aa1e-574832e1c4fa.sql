-- =====================================================
-- FIX: Recreate RLS policies for profiles_private and profiles
-- Ensure they are PERMISSIVE (default) and properly secure
-- =====================================================

-- ===================
-- PROFILES_PRIVATE
-- ===================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own private profile if in active tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can insert own private profile if in active tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can update own private profile if in active tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can delete own private profile if in active tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admins can manage private profiles in their tenant" ON public.profiles_private;

-- Ensure RLS is enabled
ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too (defense in depth)
ALTER TABLE public.profiles_private FORCE ROW LEVEL SECURITY;

-- Create PERMISSIVE policies for profiles_private
CREATE POLICY "Users can view own private profile"
ON public.profiles_private
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND public.user_has_active_membership(auth.uid())
);

CREATE POLICY "Users can insert own private profile"
ON public.profiles_private
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND public.user_has_active_membership(auth.uid())
);

CREATE POLICY "Users can update own private profile"
ON public.profiles_private
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND public.user_has_active_membership(auth.uid())
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND public.user_has_active_membership(auth.uid())
);

CREATE POLICY "Users can delete own private profile"
ON public.profiles_private
FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND public.user_has_active_membership(auth.uid())
);

CREATE POLICY "Tenant admins can manage private profiles"
ON public.profiles_private
FOR ALL
USING (
  auth.uid() IS NOT NULL 
  AND public.can_admin_access_profile(user_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND public.can_admin_access_profile(user_id)
);

-- ===================
-- PROFILES
-- ===================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can view profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can manage profiles in their tenant" ON public.profiles;

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too (defense in depth)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- Create PERMISSIVE policies for profiles
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = id
);

CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = id
);

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = id
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = id
);

CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND public.can_admin_access_profile(id)
);

CREATE POLICY "Tenant admins can manage profiles in their tenant"
ON public.profiles
FOR ALL
USING (
  auth.uid() IS NOT NULL 
  AND public.can_admin_access_profile(id)
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND public.can_admin_access_profile(id)
);