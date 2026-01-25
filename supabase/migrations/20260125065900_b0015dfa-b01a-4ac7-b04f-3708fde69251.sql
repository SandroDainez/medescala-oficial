-- Drop the existing admin policy that doesn't explicitly check tenant
DROP POLICY IF EXISTS "Tenant admins can manage assignment locations" ON public.shift_assignment_locations;

-- Create new policy with explicit tenant_id verification
CREATE POLICY "Tenant admins can manage assignment locations"
ON public.shift_assignment_locations
FOR ALL
USING (
  auth.uid() IS NOT NULL 
  AND tenant_id IS NOT NULL
  AND is_tenant_admin(auth.uid(), tenant_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND tenant_id IS NOT NULL
  AND is_tenant_admin(auth.uid(), tenant_id)
);