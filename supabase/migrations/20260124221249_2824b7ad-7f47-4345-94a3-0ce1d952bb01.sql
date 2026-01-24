-- Add a RESTRICTIVE catch-all policy to shifts table
-- This ensures NO access is possible without tenant membership, even if other policies have bugs

CREATE POLICY "Require tenant membership for all shifts access"
ON public.shifts
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (is_tenant_member(auth.uid(), tenant_id))
WITH CHECK (is_tenant_member(auth.uid(), tenant_id));