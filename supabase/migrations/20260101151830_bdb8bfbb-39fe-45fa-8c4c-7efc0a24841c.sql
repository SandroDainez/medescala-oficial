-- Fix: allow tenant admins to INSERT/UPDATE/DELETE shift_assignments (WITH CHECK was missing)
-- First drop the existing policy
DROP POLICY IF EXISTS "Tenant admins can manage all assignments" ON public.shift_assignments;

-- Recreate policy with proper WITH CHECK clause
CREATE POLICY "Tenant admins can manage all assignments"
ON public.shift_assignments
FOR ALL
TO authenticated
USING (
  (auth.uid() IS NOT NULL)
  AND public.is_tenant_admin(auth.uid(), tenant_id)
)
WITH CHECK (
  (auth.uid() IS NOT NULL)
  AND public.is_tenant_admin(auth.uid(), tenant_id)
);