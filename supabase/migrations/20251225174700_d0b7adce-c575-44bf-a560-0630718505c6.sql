-- Allow tenant members to view all shift assignments in their tenant (for calendar display)
DROP POLICY IF EXISTS "Users can view their assignments in tenant" ON public.shift_assignments;

CREATE POLICY "Tenant members can view all assignments in tenant" 
ON public.shift_assignments 
FOR SELECT 
USING (is_tenant_member(auth.uid(), tenant_id));

-- Keep the existing policy for updating only their own checkin/checkout
-- (already exists: "Users can update their own checkin/checkout")