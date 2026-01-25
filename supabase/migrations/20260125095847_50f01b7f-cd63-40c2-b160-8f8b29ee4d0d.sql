
-- Fix shifts policy: NULL sector_id should only be visible to admin/GABS/super_admin
-- Currently the policy allows ANY tenant member to see NULL sector shifts

DROP POLICY IF EXISTS "Users can view shifts in their sectors" ON public.shifts;

CREATE POLICY "Users can view shifts in their sectors" 
ON public.shifts
FOR SELECT
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- Privileged users: can see ALL shifts including NULL sector_id
    has_gabs_bypass(auth.uid()) 
    OR is_super_admin(auth.uid()) 
    OR is_tenant_admin(auth.uid(), tenant_id)
    -- Regular users: MUST have sector_id NOT NULL AND be member of that sector
    OR (
      sector_id IS NOT NULL 
      AND EXISTS (
        SELECT 1
        FROM public.sector_memberships sm
        WHERE sm.sector_id = shifts.sector_id 
          AND sm.user_id = auth.uid() 
          AND sm.tenant_id = shifts.tenant_id
      )
    )
  )
);
