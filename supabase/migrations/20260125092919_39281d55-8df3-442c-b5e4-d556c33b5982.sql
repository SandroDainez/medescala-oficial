-- Fix remaining {public} policy on shift_assignment_locations
DROP POLICY IF EXISTS "Tenant admins can manage assignment locations" ON public.shift_assignment_locations;

CREATE POLICY "Tenant admins can manage assignment locations"
ON public.shift_assignment_locations
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));