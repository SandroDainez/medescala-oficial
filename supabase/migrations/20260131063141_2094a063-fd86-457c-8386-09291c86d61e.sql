-- Drop the old policy and create a corrected one without sector_id IS NULL bypass
DROP POLICY IF EXISTS "Users can view shifts in their sectors or assigned to them" ON public.shifts;

CREATE POLICY "Users can view shifts in their sectors or assigned to them"
ON public.shifts
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- GABS bypass
    has_gabs_bypass(auth.uid())
    OR 
    -- Super admin
    is_super_admin(auth.uid())
    OR 
    -- Tenant admin
    is_tenant_admin(auth.uid(), tenant_id)
    OR 
    -- User is member of the shift's sector
    EXISTS (
      SELECT 1
      FROM sector_memberships sm
      WHERE sm.sector_id = shifts.sector_id 
        AND sm.user_id = auth.uid() 
        AND sm.tenant_id = shifts.tenant_id
    )
    OR 
    -- User is assigned to this shift
    EXISTS (
      SELECT 1
      FROM shift_assignments sa
      WHERE sa.shift_id = shifts.id 
        AND sa.user_id = auth.uid()
    )
    -- REMOVED: sector_id IS NULL condition
  )
);