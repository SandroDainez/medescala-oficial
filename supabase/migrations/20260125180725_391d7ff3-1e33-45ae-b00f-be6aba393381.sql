
-- Drop existing permissive SELECT policy for memberships
DROP POLICY IF EXISTS "Tenant members can view memberships" ON public.memberships;
DROP POLICY IF EXISTS "Users can view memberships in their tenant" ON public.memberships;

-- Create restrictive policy: Users can only see their OWN membership
-- Admins can see all memberships in their tenant
CREATE POLICY "Users can view own membership or admins see all"
ON public.memberships
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Users can always see their own membership
    user_id = auth.uid()
    OR
    -- Tenant admins can see all memberships in their tenant
    is_tenant_admin(auth.uid(), tenant_id)
    OR
    -- GABS bypass for system administration
    has_gabs_bypass(auth.uid())
    OR
    -- Super admins can see all
    is_super_admin(auth.uid())
  )
);
