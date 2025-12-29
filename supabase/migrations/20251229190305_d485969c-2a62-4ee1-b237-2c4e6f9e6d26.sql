-- Tighten tenant isolation for sensitive tables and reduce reliance on helper-only checks

-- 1) profiles_private: ensure admins can only access rows where the target user is actually a member of that row's tenant
DROP POLICY IF EXISTS "Tenant admin can view private profile in their tenant" ON public.profiles_private;
CREATE POLICY "Tenant admin can view private profile in their tenant"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND public.is_tenant_admin(auth.uid(), tenant_id)
  AND public.is_tenant_member(user_id, tenant_id)
);

DROP POLICY IF EXISTS "Tenant admin can update private profile in their tenant" ON public.profiles_private;
CREATE POLICY "Tenant admin can update private profile in their tenant"
ON public.profiles_private
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND public.is_tenant_admin(auth.uid(), tenant_id)
  AND public.is_tenant_member(user_id, tenant_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND public.is_tenant_admin(auth.uid(), tenant_id)
  AND public.is_tenant_member(user_id, tenant_id)
);

-- 2) profiles: explicit tenant-scoped access without requiring a tenant_id column
--    Users can read a profile only if they share at least one active tenant membership with that profile.
DROP POLICY IF EXISTS "Tenant members can view profiles in their tenant" ON public.profiles;
CREATE POLICY "Tenant members can view profiles in their tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.memberships m_me
    JOIN public.memberships m_target
      ON m_target.tenant_id = m_me.tenant_id
    WHERE m_me.user_id = auth.uid()
      AND m_me.active = true
      AND m_target.user_id = public.profiles.id
      AND m_target.active = true
  )
);
