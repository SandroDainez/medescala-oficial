-- =====================================================
-- SECURITY HARDENING: Granular access with GABS exception
-- GABS Tenant ID: b2541db1-5029-4fb9-8d1c-870c2738e0d6
-- =====================================================

-- 1. Add expires_at and reason to permission tables
ALTER TABLE public.pii_access_permissions
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE public.payment_access_permissions
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reason TEXT;

-- 2. Create constant function for GABS tenant ID (easier maintenance)
CREATE OR REPLACE FUNCTION public.get_gabs_tenant_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'b2541db1-5029-4fb9-8d1c-870c2738e0d6'::uuid
$$;

-- 3. Check if user has GABS bypass (is GABS member AND super_admin)
CREATE OR REPLACE FUNCTION public.has_gabs_bypass(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins sa
    JOIN public.memberships m ON m.user_id = sa.user_id
    WHERE sa.user_id = _user_id
      AND m.tenant_id = public.get_gabs_tenant_id()
      AND m.active = true
  )
$$;

-- 4. Updated has_pii_access with temporal grants + GABS bypass
CREATE OR REPLACE FUNCTION public.has_pii_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- GABS super admins have full access
    public.has_gabs_bypass(_user_id)
    OR
    -- Super admins (global) have access
    public.is_super_admin(_user_id)
    OR
    -- Temporal grant: valid if not expired
    EXISTS (
      SELECT 1
      FROM public.pii_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND (pap.expires_at IS NULL OR pap.expires_at > now())
    )
  )
$$;

-- 5. Updated has_payment_access with GABS bypass
CREATE OR REPLACE FUNCTION public.has_payment_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- GABS super admins have full access
    public.has_gabs_bypass(_user_id)
    OR
    -- Super admins (global) have access
    public.is_super_admin(_user_id)
    OR
    -- Temporal grant: valid if not expired
    EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND (pap.expires_at IS NULL OR pap.expires_at > now())
    )
  )
$$;

-- 6. Function to check if user can view a specific profile
-- Own profile OR admin in same tenant OR GABS bypass
CREATE OR REPLACE FUNCTION public.can_view_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Own profile
    auth.uid() = _profile_id
    OR
    -- GABS bypass
    public.has_gabs_bypass(auth.uid())
    OR
    -- Super admin
    public.is_super_admin(auth.uid())
    OR
    -- Admin in same tenant
    public.can_admin_access_profile(_profile_id)
  )
$$;

-- 7. Function to check if user is assigned to a shift
CREATE OR REPLACE FUNCTION public.is_assigned_to_shift(_shift_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.shift_id = _shift_id
      AND sa.user_id = _user_id
  )
$$;

-- 8. Function to check if user can view a shift
-- Admin OR assigned OR finance with payment access OR GABS bypass
CREATE OR REPLACE FUNCTION public.can_view_shift(_shift_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- GABS bypass
    public.has_gabs_bypass(auth.uid())
    OR
    -- Super admin
    public.is_super_admin(auth.uid())
    OR
    -- Tenant admin
    public.is_tenant_admin(auth.uid(), _tenant_id)
    OR
    -- User is assigned to this shift
    public.is_assigned_to_shift(_shift_id, auth.uid())
    OR
    -- User is member of the shift's sector
    EXISTS (
      SELECT 1
      FROM public.shifts s
      JOIN public.sector_memberships sm ON sm.sector_id = s.sector_id AND sm.tenant_id = s.tenant_id
      WHERE s.id = _shift_id
        AND sm.user_id = auth.uid()
    )
    OR
    -- Finance user for payment reconciliation
    public.has_payment_access(auth.uid(), _tenant_id)
  )
$$;

-- =====================================================
-- UPDATE RLS POLICIES
-- =====================================================

-- 9. PROFILES: Drop permissive tenant-wide policies, keep restrictive
DROP POLICY IF EXISTS "Tenant admins can view profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admin can view profile in their tenant" ON public.profiles;

-- New policy: Use can_view_profile function
CREATE POLICY "Authorized users can view profiles"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.can_view_profile(id));

-- 10. SHIFTS: More restrictive access
DROP POLICY IF EXISTS "Users can view shifts in their sectors" ON public.shifts;

CREATE POLICY "Authorized users can view shifts"
ON public.shifts
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.is_tenant_member(auth.uid(), tenant_id)
  AND public.can_view_shift(id, tenant_id)
);

-- 11. PAYMENTS: Ensure temporal grants work
DROP POLICY IF EXISTS "Finance can view tenant payments" ON public.payments;

CREATE POLICY "Finance can view tenant payments"
ON public.payments
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  (user_id = auth.uid() AND public.is_tenant_member(auth.uid(), tenant_id))
  OR public.has_payment_access(auth.uid(), tenant_id)
);

-- 12. PROFILES_PRIVATE: Stricter access with temporal grants
DROP POLICY IF EXISTS "Users with PII permission can view private profiles in tenant" ON public.profiles_private;

CREATE POLICY "Authorized users can view private profiles"
ON public.profiles_private
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  (auth.uid() = user_id AND tenant_id IS NOT NULL)
  OR public.has_pii_access(auth.uid(), tenant_id)
);

-- 13. SHIFT_ASSIGNMENTS: Only see own OR admin/finance
DROP POLICY IF EXISTS "Users can view their own shift assignments" ON public.shift_assignments;

CREATE POLICY "Users can view authorized shift assignments"
ON public.shift_assignments
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.is_tenant_member(auth.uid(), tenant_id)
  AND (
    user_id = auth.uid()
    OR public.is_tenant_admin(auth.uid(), tenant_id)
    OR public.has_gabs_bypass(auth.uid())
  )
);

-- 14. SHIFT_ASSIGNMENT_LOCATIONS: Own recent OR admin with audit
DROP POLICY IF EXISTS "Users can view own recent locations (30 days)" ON public.shift_assignment_locations;

CREATE POLICY "Users can view own locations (30 days)"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- Own locations from last 30 days
    (user_id = auth.uid() AND created_at >= (now() - interval '30 days'))
    OR
    -- Admin full history (audited via get_assignment_location_with_audit RPC)
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR
    -- GABS bypass
    public.has_gabs_bypass(auth.uid())
  )
);

-- 15. PII_ACCESS_PERMISSIONS: Log all grant creations
CREATE OR REPLACE FUNCTION public.log_pii_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pii_audit_logs (
    table_name, record_id, user_id, tenant_id, action, new_data
  ) VALUES (
    'pii_access_permissions',
    NEW.id::text,
    auth.uid(),
    NEW.tenant_id,
    'GRANT_CREATED',
    jsonb_build_object(
      'granted_to', NEW.user_id,
      'expires_at', NEW.expires_at,
      'reason', NEW.reason
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_pii_grant_trigger ON public.pii_access_permissions;
CREATE TRIGGER log_pii_grant_trigger
  AFTER INSERT ON public.pii_access_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_pii_grant();

-- 16. GABS tenant: Ensure is_unlimited = true
UPDATE public.tenants
SET is_unlimited = true
WHERE id = public.get_gabs_tenant_id();

-- 17. Create indexes for performance on permission lookups
CREATE INDEX IF NOT EXISTS idx_pii_access_permissions_lookup 
ON public.pii_access_permissions (user_id, tenant_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_payment_access_permissions_lookup 
ON public.payment_access_permissions (user_id, tenant_id, expires_at);