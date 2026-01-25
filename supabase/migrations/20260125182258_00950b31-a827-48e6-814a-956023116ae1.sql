
-- Drop the problematic SELECT policy that may be causing issues
DROP POLICY IF EXISTS "Users can view shifts in their sectors or assigned to them" ON public.shifts;

-- Recreate with clearer logic: user can see shift if:
-- 1. They are privileged (GABS, super admin, tenant admin)
-- 2. They are a member of the shift's sector
-- 3. They are DIRECTLY ASSIGNED to the shift (regardless of sector membership)
-- 4. The shift has no sector (NULL sector_id) - visible to all tenant members
CREATE POLICY "Users can view shifts in their sectors or assigned to them"
ON public.shifts
FOR SELECT
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- Privileged users see all shifts in tenant
    has_gabs_bypass(auth.uid())
    OR is_super_admin(auth.uid())
    OR is_tenant_admin(auth.uid(), tenant_id)
    -- User is member of the shift's sector
    OR EXISTS (
      SELECT 1 FROM sector_memberships sm
      WHERE sm.sector_id = shifts.sector_id
        AND sm.user_id = auth.uid()
        AND sm.tenant_id = shifts.tenant_id
    )
    -- User is ASSIGNED to this shift (key fix: no sector check required)
    OR EXISTS (
      SELECT 1 FROM shift_assignments sa
      WHERE sa.shift_id = shifts.id
        AND sa.user_id = auth.uid()
    )
    -- Shifts without sector are visible to all tenant members
    OR sector_id IS NULL
  )
);
