-- Fix RLS for payments table - add stronger validation
DROP POLICY IF EXISTS "Deny anon select" ON public.payments;
DROP POLICY IF EXISTS "Users can view accessible payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can update payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can delete payments" ON public.payments;

-- Recreate with stronger policies
CREATE POLICY "Block all anonymous access to payments"
ON public.payments
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Users can view own payments in tenant"
ON public.payments
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND user_id = auth.uid() 
  AND is_tenant_member(auth.uid(), tenant_id)
);

CREATE POLICY "Tenant admin can view all tenant payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND is_tenant_admin(auth.uid(), tenant_id)
);

CREATE POLICY "Tenant admin can insert payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND is_tenant_admin(auth.uid(), tenant_id)
);

CREATE POLICY "Tenant admin can update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admin can delete payments"
ON public.payments
FOR DELETE
TO authenticated
USING (is_tenant_admin(auth.uid(), tenant_id));

-- Fix RLS for profiles_private - add explicit anon block
DROP POLICY IF EXISTS "Deny anon select" ON public.profiles_private;

CREATE POLICY "Block all anonymous access to profiles_private"
ON public.profiles_private
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Fix RLS for shift_assignment_locations - add explicit anon block
DROP POLICY IF EXISTS "Deny anon select" ON public.shift_assignment_locations;

CREATE POLICY "Block all anonymous access to shift_assignment_locations"
ON public.shift_assignment_locations
FOR ALL
TO anon
USING (false)
WITH CHECK (false);