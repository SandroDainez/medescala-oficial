-- 1. Block anonymous INSERT on profiles
CREATE POLICY "Block anon inserts on profiles" 
ON public.profiles 
FOR INSERT 
TO anon 
WITH CHECK (false);

-- 2. Block anonymous UPDATE on profiles
CREATE POLICY "Block anon updates on profiles" 
ON public.profiles 
FOR UPDATE 
TO anon 
USING (false);

-- 3. Improve shift_assignment_locations INSERT policy to validate assignment ownership
DROP POLICY IF EXISTS "Users can upsert their own assignment locations" ON public.shift_assignment_locations;

CREATE POLICY "Users can insert own assignment locations with validation" 
ON public.shift_assignment_locations 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND user_id = auth.uid() 
  AND is_tenant_member(auth.uid(), tenant_id)
  AND EXISTS (
    SELECT 1 FROM public.shift_assignments sa
    WHERE sa.id = assignment_id
      AND sa.user_id = auth.uid()
      AND sa.tenant_id = shift_assignment_locations.tenant_id
  )
);

-- 4. Add stricter policy for payments - ensure user_id matches AND active membership
DROP POLICY IF EXISTS "Users can view own payments in tenant" ON public.payments;

CREATE POLICY "Users can view own payments with active membership" 
ON public.payments 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND user_id = auth.uid() 
  AND EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE memberships.user_id = auth.uid() 
      AND memberships.tenant_id = payments.tenant_id 
      AND memberships.active = true
  )
);