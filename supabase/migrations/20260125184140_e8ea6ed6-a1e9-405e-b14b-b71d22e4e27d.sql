
-- ============================================================================
-- CORREÇÃO DEFINITIVA DE SEGURANÇA - ORDEM CORRETA (drop policies primeiro)
-- ============================================================================

-- 1. PRIMEIRO: Dropar políticas que usam as funções
DROP POLICY IF EXISTS "PII access requires explicit grant or ownership" ON public.profiles_private;
DROP POLICY IF EXISTS "Super admins can view private profiles" ON public.profiles_private;

-- 2. Dropar e recriar has_pii_access SEM bypasses
CREATE OR REPLACE FUNCTION public.has_pii_access(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.pii_access_permissions pap
      WHERE pap.user_id = auth.uid()
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL  -- OBRIGATÓRIO ter expiração
        AND pap.expires_at > now()       -- Não pode estar expirado
    )
  )
$$;

-- 2b. Também corrigir versão com 2 args que pode existir
CREATE OR REPLACE FUNCTION public.has_pii_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.pii_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;

-- 3. Recriar política de PII correta (PERMISSIVE, não RESTRICTIVE)
CREATE POLICY "PII access requires explicit grant or ownership"
ON public.profiles_private
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND (
    -- Dono vê próprio perfil
    (auth.uid() = user_id AND is_tenant_member(auth.uid(), tenant_id))
    OR
    -- Grant temporal explícito obrigatório
    has_pii_access(tenant_id)
  )
);

-- 4. Corrigir has_payment_access SEM bypasses (ambas versões)
CREATE OR REPLACE FUNCTION public.has_payment_access(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = auth.uid()
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_payment_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;
