-- Restore the correct profiles policy (was already properly isolated via JOIN)
-- This policy ONLY allows viewing profiles of users who share at least one active tenant
CREATE POLICY "Tenant members can view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1
    FROM memberships m_me
    JOIN memberships m_target ON m_target.tenant_id = m_me.tenant_id
    WHERE m_me.user_id = auth.uid()
      AND m_me.active = true
      AND m_target.user_id = profiles.id
      AND m_target.active = true
  )
);