-- Allow tenant members to view basic profile info (name) of colleagues in their tenant
-- This is necessary for shift calendar to show assigned user names

CREATE POLICY "Tenant members can view colleague profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.memberships m1
    JOIN public.memberships m2 ON m1.tenant_id = m2.tenant_id
    WHERE m1.user_id = auth.uid()
      AND m1.active = true
      AND m2.user_id = profiles.id
      AND m2.active = true
  )
);