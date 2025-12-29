-- Remove direct tenant-admin read/update access to encrypted PII rows.
-- Admin workflows must go through the secured backend function (pii-crypto) which uses the service role key + explicit authorization.

-- profiles_private
DROP POLICY IF EXISTS "Tenant admin can view private profile in their tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admin can update private profile in their tenant" ON public.profiles_private;

-- (Optional hardening) Ensure only the row owner can SELECT/UPDATE/DELETE.
-- These policies already exist in this project; we re-create them idempotently to avoid drift.
DROP POLICY IF EXISTS "Owner can view own private profile" ON public.profiles_private;
CREATE POLICY "Owner can view own private profile"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND tenant_id IS NOT NULL
);

DROP POLICY IF EXISTS "Owner can update own private profile" ON public.profiles_private;
CREATE POLICY "Owner can update own private profile"
ON public.profiles_private
FOR UPDATE
TO authenticated
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

DROP POLICY IF EXISTS "Owner can delete own private profile" ON public.profiles_private;
CREATE POLICY "Owner can delete own private profile"
ON public.profiles_private
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
);

-- Keep the existing "Owner can insert own private profile" policy as-is (or recreate if missing).
DROP POLICY IF EXISTS "Owner can insert own private profile" ON public.profiles_private;
CREATE POLICY "Owner can insert own private profile"
ON public.profiles_private
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND tenant_id IS NOT NULL
);
