-- Drop the overly permissive policy that allows any authenticated user to view profiles
DROP POLICY IF EXISTS "Tenant members can view profiles in their tenant" ON public.profiles;

-- Create a more restrictive policy that only allows viewing profiles within the same tenant
CREATE POLICY "Tenant members can view profiles in their tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND (
    -- User can always see their own profile
    auth.uid() = id
    OR
    -- User can see profiles of other members in any tenant they belong to
    EXISTS (
      SELECT 1
      FROM public.memberships m_viewer
      JOIN public.memberships m_target ON m_target.tenant_id = m_viewer.tenant_id
      WHERE m_viewer.user_id = auth.uid()
        AND m_viewer.active = true
        AND m_target.user_id = profiles.id
        AND m_target.active = true
    )
  )
);