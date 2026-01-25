
-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view shifts in their sectors" ON public.shifts;

-- Create updated policy that allows users to see:
-- 1. Shifts in sectors they are members of (all shifts, not just their own)
-- 2. Their own assigned shifts (even if not a sector member)
CREATE POLICY "Users can view shifts in their sectors or assigned to them"
ON public.shifts
FOR SELECT
USING (
  is_tenant_member(auth.uid(), tenant_id) 
  AND (
    -- GABS bypass
    has_gabs_bypass(auth.uid())
    OR
    -- Super admin
    is_super_admin(auth.uid())
    OR
    -- Tenant admin sees all
    is_tenant_admin(auth.uid(), tenant_id)
    OR
    -- User is a member of the shift's sector (sees ALL shifts in that sector)
    (
      sector_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM sector_memberships sm 
        WHERE sm.sector_id = shifts.sector_id 
          AND sm.user_id = auth.uid() 
          AND sm.tenant_id = shifts.tenant_id
      )
    )
    OR
    -- User is directly assigned to this shift (even if not a sector member)
    EXISTS (
      SELECT 1 FROM shift_assignments sa 
      WHERE sa.shift_id = shifts.id 
        AND sa.user_id = auth.uid()
    )
    OR
    -- Shifts without sector visible to all tenant members
    sector_id IS NULL
  )
);
