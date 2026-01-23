-- =============================================================
-- FIX: Strengthen payments table RLS policy
-- Ensure user_id = auth.uid() is checked FIRST before membership
-- =============================================================

-- Drop the existing policy that has the vulnerability
DROP POLICY IF EXISTS "Users can view own payments with active membership" ON public.payments;

-- Create a stronger policy that checks user_id first
CREATE POLICY "Users can view own payments"
ON public.payments
FOR SELECT
TO authenticated
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

-- Also add explicit anonymous block for payments
CREATE POLICY "Block anonymous select on payments"
ON public.payments
FOR SELECT
TO anon
USING (false);