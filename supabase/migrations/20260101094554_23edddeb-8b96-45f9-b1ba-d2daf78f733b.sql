-- Add SELECT policy for tenant admins to view profiles_private of their employees
-- This is documented in docs/SECURITY_DECISIONS.md as an intentional access pattern for payroll processing.
CREATE POLICY "Tenant admin can view private profiles in their tenant"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (
  (auth.uid() IS NOT NULL)
  AND is_tenant_admin(auth.uid(), tenant_id)
);