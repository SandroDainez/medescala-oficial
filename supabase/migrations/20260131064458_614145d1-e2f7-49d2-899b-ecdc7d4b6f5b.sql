-- Fix security issue: profiles_private PII access must validate tenant membership
-- The current policy allows anyone with PII access in ANY tenant to see ALL profiles_private records

DROP POLICY IF EXISTS "PII access requires explicit grant or ownership" ON public.profiles_private;

CREATE POLICY "PII access requires explicit grant or ownership"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND (
    -- Owner can always view their own data in their tenant
    (auth.uid() = user_id AND is_tenant_member(auth.uid(), tenant_id))
    OR
    -- User with PII access can view data ONLY for the same tenant they have the grant
    (
      has_pii_access(auth.uid(), tenant_id)
      AND is_tenant_member(auth.uid(), tenant_id)
    )
  )
);