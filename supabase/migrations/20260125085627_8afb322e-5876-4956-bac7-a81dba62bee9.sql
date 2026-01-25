-- =====================================================
-- ADDITIONAL FIXES: GPS audit logs visibility + secure view
-- =====================================================

-- 1. Allow tenant admins to view GPS access logs for their tenant
CREATE POLICY "Tenant admins can view gps access logs"
ON public.gps_access_logs
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.is_tenant_admin(auth.uid(), tenant_id)
  OR public.has_gabs_bypass(auth.uid())
);

-- 2. Drop the problematic view and recreate with RLS inheritance
DROP VIEW IF EXISTS public.shift_assignment_locations_secure CASCADE;

-- The base table already has proper RLS, no need for a separate view
-- Access should go through the base table with RLS policies

-- 3. Add comment explaining GABS bypass is intentional
COMMENT ON FUNCTION public.has_gabs_bypass(uuid) IS 
'SECURITY: Intentional bypass for GABS internal staff who are super_admins. 
Required for: system administration, support, compliance auditing.
Requires BOTH conditions: is super_admin AND has active membership in GABS tenant.
Documented in docs/SECURITY_DECISIONS.md section 11.';