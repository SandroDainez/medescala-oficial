-- =============================================================================
-- Tighten shift_assignment_locations GPS access policy
-- =============================================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view own active shift locations" ON public.shift_assignment_locations;

-- Create more explicit policy with clear conditions
CREATE POLICY "Users can view own active shift locations"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  -- Must be tenant member first
  is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- Option 1: Own data within 12-hour window
    (
      user_id = auth.uid()
      AND created_at > now() - interval '12 hours'
    )
    OR
    -- Option 2: Explicit GPS grant (requires gps_access_grants entry with valid expires_at)
    has_gps_access(tenant_id)
  )
);

-- Verify has_gps_access function is strict (no bypass)
CREATE OR REPLACE FUNCTION public.has_gps_access(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Must be authenticated
    auth.uid() IS NOT NULL
    -- Must have valid tenant
    AND _tenant_id IS NOT NULL
    -- Must be tenant member
    AND is_tenant_member(auth.uid(), _tenant_id)
    -- Must have explicit grant with valid expiration
    AND EXISTS (
      SELECT 1
      FROM public.gps_access_grants gag
      WHERE gag.user_id = auth.uid()
        AND gag.tenant_id = _tenant_id
        AND gag.expires_at IS NOT NULL
        AND gag.expires_at > now()
    )
  )
$$;

-- Also update two-arg version to be consistent
CREATE OR REPLACE FUNCTION public.has_gps_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND is_tenant_member(_user_id, _tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.gps_access_grants gag
      WHERE gag.user_id = _user_id
        AND gag.tenant_id = _tenant_id
        AND gag.expires_at IS NOT NULL
        AND gag.expires_at > now()
    )
  )
$$;

-- Add comments
COMMENT ON FUNCTION public.has_gps_access(uuid) IS 'GPS access requires: authenticated + tenant_member + explicit grant in gps_access_grants with expires_at > now(). No automatic bypass.';
COMMENT ON FUNCTION public.has_gps_access(uuid, uuid) IS 'GPS access requires: tenant_member + explicit grant in gps_access_grants with expires_at > now(). No automatic bypass.';