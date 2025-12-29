-- Fix: Add explicit INSERT block for anon on profiles_private
CREATE POLICY "Block anonymous inserts to profiles_private"
ON public.profiles_private
FOR INSERT
TO anon
WITH CHECK (false);

-- Fix: Add explicit INSERT block for anon on payments  
CREATE POLICY "Block anonymous inserts to payments"
ON public.payments
FOR INSERT
TO anon
WITH CHECK (false);

-- Fix: Add explicit INSERT block for anon on shift_assignment_locations
CREATE POLICY "Block anonymous inserts to shift_assignment_locations"
ON public.shift_assignment_locations
FOR INSERT
TO anon
WITH CHECK (false);

-- Fix: Add DELETE policy for shift_assignment_locations (admins only)
CREATE POLICY "Admins can delete assignment locations"
ON public.shift_assignment_locations
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- Fix: Add DELETE policy for shift_entries (admins only)
CREATE POLICY "Admins can delete shift entries"
ON public.shift_entries
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- Fix: Add UPDATE and DELETE policies for absences (users can modify pending)
CREATE POLICY "Users can update pending absences"
ON public.absences
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status = 'pending' AND is_tenant_member(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status = 'pending' AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Users can delete pending absences"
ON public.absences
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status = 'pending' AND is_tenant_member(auth.uid(), tenant_id));