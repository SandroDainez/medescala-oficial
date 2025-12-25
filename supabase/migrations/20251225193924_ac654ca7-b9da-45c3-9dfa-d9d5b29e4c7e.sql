-- Fix infinite recursion in RLS policies for super_admins
-- The policy below referenced the same table inside USING, causing recursion.

DO $$
BEGIN
  -- Drop the recursive policy if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'super_admins'
      AND policyname = 'Super admins can view super_admins'
  ) THEN
    EXECUTE 'DROP POLICY "Super admins can view super_admins" ON public.super_admins';
  END IF;
END $$;

-- Ensure a non-recursive SELECT policy exists
DROP POLICY IF EXISTS "Super admins can view super_admins table" ON public.super_admins;
CREATE POLICY "Super admins can view super_admins table"
ON public.super_admins
FOR SELECT
USING (public.is_super_admin());
