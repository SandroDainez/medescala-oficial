-- Fix: Add WITH CHECK to allow admins to UPDATE/INSERT shifts
DROP POLICY IF EXISTS "Tenant admins can manage shifts" ON public.shifts;

CREATE POLICY "Tenant admins can manage shifts"
ON public.shifts
FOR ALL
TO authenticated
USING ((auth.uid() IS NOT NULL) AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK ((auth.uid() IS NOT NULL) AND is_tenant_admin(auth.uid(), tenant_id));