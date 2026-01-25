
-- FIX: The "Users can view authorized shift assignments" policy is RESTRICTIVE
-- but should be PERMISSIVE. RESTRICTIVE policies require ALL to pass (AND logic)
-- but there's no PERMISSIVE SELECT policy to actually grant access!

-- Drop the broken RESTRICTIVE policy
DROP POLICY IF EXISTS "Users can view authorized shift assignments" ON public.shift_assignments;

-- Recreate as PERMISSIVE (the default) so it correctly grants SELECT access
CREATE POLICY "Users can view authorized shift assignments"
ON public.shift_assignments
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id) 
  AND (
    user_id = auth.uid() 
    OR is_tenant_admin(auth.uid(), tenant_id) 
    OR has_gabs_bypass(auth.uid())
  )
);
