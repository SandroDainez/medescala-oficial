-- =====================================================
-- FIX: Shifts visibility - user sees ALL shifts from their sectors
-- =====================================================

-- 1. Update can_view_shift to include sector membership for ALL shifts in that sector
CREATE OR REPLACE FUNCTION public.can_view_shift(_shift_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- GABS bypass (super_admin + GABS member)
    public.has_gabs_bypass(auth.uid())
    OR
    -- Global super admin
    public.is_super_admin(auth.uid())
    OR
    -- Tenant admin sees all shifts in their tenant
    public.is_tenant_admin(auth.uid(), _tenant_id)
    OR
    -- User is member of the shift's sector (sees ALL shifts in that sector)
    EXISTS (
      SELECT 1
      FROM public.shifts s
      JOIN public.sector_memberships sm ON sm.sector_id = s.sector_id 
                                        AND sm.tenant_id = s.tenant_id
      WHERE s.id = _shift_id
        AND sm.user_id = auth.uid()
    )
    OR
    -- Shifts without sector (NULL sector_id) visible to all tenant members
    EXISTS (
      SELECT 1
      FROM public.shifts s
      WHERE s.id = _shift_id
        AND s.sector_id IS NULL
        AND public.is_tenant_member(auth.uid(), s.tenant_id)
    )
  )
$$;

-- 2. Drop existing policy and recreate with clearer logic
DROP POLICY IF EXISTS "Authorized users can view shifts" ON public.shifts;

CREATE POLICY "Users can view shifts in their sectors"
ON public.shifts
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  -- Must be tenant member (blocks cross-tenant)
  public.is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- Super admin / GABS bypass
    public.has_gabs_bypass(auth.uid())
    OR public.is_super_admin(auth.uid())
    -- Tenant admin
    OR public.is_tenant_admin(auth.uid(), tenant_id)
    -- User is member of the shift's sector
    OR EXISTS (
      SELECT 1
      FROM public.sector_memberships sm
      WHERE sm.sector_id = shifts.sector_id
        AND sm.user_id = auth.uid()
        AND sm.tenant_id = shifts.tenant_id
    )
    -- Shifts without sector visible to all tenant members
    OR sector_id IS NULL
  )
);

-- 3. Add comment explaining the policy
COMMENT ON POLICY "Users can view shifts in their sectors" ON public.shifts IS 
'Usuários veem TODAS as escalas dos setores que participam (via sector_memberships).
Shifts sem setor (sector_id NULL) são visíveis para todos os membros do tenant.
Admins e super_admins veem tudo no tenant. Cross-tenant e anon bloqueados.';