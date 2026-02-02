
-- ============================================================
-- FIX: Recursão infinita em shifts <-> shift_assignments
-- Problema: policy de shifts consulta shift_assignments que consulta shifts
-- Solução: usar funções SECURITY DEFINER para quebrar o ciclo
-- ============================================================

-- 1. Criar função para verificar se usuário é membro do setor do shift
CREATE OR REPLACE FUNCTION public.is_sector_member_of_shift(_shift_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shifts s
    INNER JOIN public.sector_memberships sm 
      ON sm.sector_id = s.sector_id 
      AND sm.tenant_id = s.tenant_id
    WHERE s.id = _shift_id
      AND sm.user_id = _user_id
  )
$$;

-- 2. Remover policy antiga de shift_assignments que causa recursão
DROP POLICY IF EXISTS "Users can view shift assignments in their sectors" ON public.shift_assignments;

-- 3. Criar nova policy usando função SECURITY DEFINER (sem JOIN em shifts)
CREATE POLICY "Users can view shift assignments in their sectors"
ON public.shift_assignments
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- Admin/Super pode ver tudo do tenant
    is_tenant_admin(auth.uid(), tenant_id)
    OR is_super_admin(auth.uid())
    OR has_gabs_bypass(auth.uid())
    -- Própria atribuição
    OR user_id = auth.uid()
    -- Membro do setor do shift (via função SECURITY DEFINER)
    OR is_sector_member_of_shift(shift_id, auth.uid())
  )
);

-- 4. Garantir que a policy de shifts não cause recursão também
-- A policy atual usa EXISTS em shift_assignments que pode causar problema
DROP POLICY IF EXISTS "Users can view shifts in their sectors or assigned to them" ON public.shifts;

CREATE POLICY "Users can view shifts in their sectors or assigned to them"
ON public.shifts
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND (
    has_gabs_bypass(auth.uid())
    OR is_super_admin(auth.uid())
    OR is_tenant_admin(auth.uid(), tenant_id)
    -- Membro do setor (acesso direto, sem passar por shift_assignments)
    OR EXISTS (
      SELECT 1
      FROM public.sector_memberships sm
      WHERE sm.sector_id = shifts.sector_id
        AND sm.user_id = auth.uid()
        AND sm.tenant_id = shifts.tenant_id
    )
    -- Atribuído ao shift (usa função para evitar recursão)
    OR is_assigned_to_shift(id, auth.uid())
  )
);
