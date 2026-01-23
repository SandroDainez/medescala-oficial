-- Fix 1: Reduce user directory exposure on public.profiles
-- Remove broad tenant-member visibility; keep self + tenant-admin access.
DROP POLICY IF EXISTS "Tenant members can view profiles in their tenant" ON public.profiles;

-- Keep/ensure owner can view own profile (already exists in most setups)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Owner can view own profile'
  ) THEN
    CREATE POLICY "Owner can view own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND auth.uid() = id);
  END IF;
END $$;

-- Keep/ensure tenant admin can view profile in their tenant (already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Tenant admin can view profile in their tenant'
  ) THEN
    CREATE POLICY "Tenant admin can view profile in their tenant"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND can_admin_access_profile(id));
  END IF;
END $$;

-- Fix 2: Remove direct tenant-admin access to encrypted PII in public.profiles_private
DROP POLICY IF EXISTS "Tenant admin can view private profiles in their tenant" ON public.profiles_private;

-- Allow super admins to view encrypted PII (for compliance/support)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles_private' AND policyname='Super admins can view private profiles'
  ) THEN
    CREATE POLICY "Super admins can view private profiles"
    ON public.profiles_private
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));
  END IF;
END $$;