-- Drop the current permissive SELECT policy for tenant members
DROP POLICY IF EXISTS "Tenant members can view shifts" ON public.shifts;

-- Create a more restrictive policy: users can only see shifts in sectors they belong to
CREATE POLICY "Users can view shifts in their sectors"
ON public.shifts
FOR SELECT
USING (
  (auth.uid() IS NOT NULL) 
  AND (
    -- Admins can see all shifts in their tenant
    is_tenant_admin(auth.uid(), tenant_id)
    OR
    -- Users can see shifts in sectors they're members of
    (
      is_tenant_member(auth.uid(), tenant_id)
      AND (
        -- Shift has no sector (legacy/unassigned)
        sector_id IS NULL
        OR
        -- User is a member of this sector
        EXISTS (
          SELECT 1 FROM public.sector_memberships sm
          WHERE sm.sector_id = shifts.sector_id
            AND sm.user_id = auth.uid()
            AND sm.tenant_id = shifts.tenant_id
        )
      )
    )
    OR
    -- Users can always see shifts they're assigned to
    EXISTS (
      SELECT 1 FROM public.shift_assignments sa
      WHERE sa.shift_id = shifts.id
        AND sa.user_id = auth.uid()
    )
  )
);