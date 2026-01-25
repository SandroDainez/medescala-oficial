-- =====================================================
-- FIX: profiles_private - stricter access control
-- =====================================================

-- 1. Drop the broad policy that scanner flagged
DROP POLICY IF EXISTS "Authorized users can view private profiles" ON public.profiles_private;

-- 2. Create stricter RESTRICTIVE policy for PII access
-- Only allows:
--   a) Owner viewing their own data (with tenant validation)
--   b) Users with explicit time-limited grants via pii_access_permissions
CREATE POLICY "PII access requires explicit grant or ownership"
ON public.profiles_private
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  -- Must have valid tenant_id
  tenant_id IS NOT NULL
  AND (
    -- Owner can view own profile
    (auth.uid() = user_id AND public.is_tenant_member(auth.uid(), tenant_id))
    OR
    -- Explicit PII grant with expiration check (includes super_admin and GABS bypass)
    public.has_pii_access(auth.uid(), tenant_id)
  )
);

-- 3. Add comment explaining the policy
COMMENT ON POLICY "PII access requires explicit grant or ownership" ON public.profiles_private IS 
'Acesso PII requer: (1) dono do perfil com membership ativa OU (2) grant explícito em pii_access_permissions 
com expires_at válido. Super admins e GABS bypass são validados dentro de has_pii_access().
Tabela pii_access_permissions já possui expires_at e reason para grants temporais auditáveis.';