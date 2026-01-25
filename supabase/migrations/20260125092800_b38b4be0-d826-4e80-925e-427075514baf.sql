-- =============================================================================
-- FINAL HARDENING: profiles_private policies + function signatures
-- =============================================================================

-- 1) DROP old PERMISSIVE policies with {public} role on profiles_private
DROP POLICY IF EXISTS "Owner can delete own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Owner can insert own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Owner can update own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Owner can view own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Super admins can view private profiles" ON public.profiles_private;

-- 2) CREATE new policies with {authenticated} role
CREATE POLICY "Owner can view own private profile"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id AND tenant_id IS NOT NULL);

CREATE POLICY "Owner can insert own private profile"
ON public.profiles_private
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id AND tenant_id IS NOT NULL);

CREATE POLICY "Owner can update own private profile"
ON public.profiles_private
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id AND tenant_id IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id AND tenant_id IS NOT NULL);

CREATE POLICY "Owner can delete own private profile"
ON public.profiles_private
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Super admins can view private profiles"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));

-- 3) Update has_pii_access to use current user implicitly (cleaner API)
CREATE OR REPLACE FUNCTION public.has_pii_access(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND (
      -- Super admin with GABS membership
      public.has_gabs_bypass(auth.uid())
      OR
      -- Global super admin
      public.is_super_admin(auth.uid())
      OR
      -- Temporal grant: valid if not expired
      EXISTS (
        SELECT 1
        FROM public.pii_access_permissions pap
        WHERE pap.user_id = auth.uid()
          AND pap.tenant_id = _tenant_id
          AND (pap.expires_at IS NULL OR pap.expires_at > now())
      )
    )
  )
$$;

-- Keep backward compatible version with explicit user_id
CREATE OR REPLACE FUNCTION public.has_pii_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND (
      public.has_gabs_bypass(_user_id)
      OR
      public.is_super_admin(_user_id)
      OR
      EXISTS (
        SELECT 1
        FROM public.pii_access_permissions pap
        WHERE pap.user_id = _user_id
          AND pap.tenant_id = _tenant_id
          AND (pap.expires_at IS NULL OR pap.expires_at > now())
      )
    )
  )
$$;

-- 4) Update has_payment_access to use current user implicitly
CREATE OR REPLACE FUNCTION public.has_payment_access(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = auth.uid()
        AND pap.tenant_id = _tenant_id
        AND (pap.expires_at IS NULL OR pap.expires_at > now())
    )
  )
$$;

-- Keep backward compatible version with explicit user_id
CREATE OR REPLACE FUNCTION public.has_payment_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND (pap.expires_at IS NULL OR pap.expires_at > now())
    )
  )
$$;

-- 5) Update has_gps_access to use current user implicitly
CREATE OR REPLACE FUNCTION public.has_gps_access(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.gps_access_grants gag
      WHERE gag.user_id = auth.uid()
        AND gag.tenant_id = _tenant_id
        AND (gag.expires_at IS NULL OR gag.expires_at > now())
    )
  )
$$;

-- Keep backward compatible version with explicit user_id
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
    AND EXISTS (
      SELECT 1
      FROM public.gps_access_grants gag
      WHERE gag.user_id = _user_id
        AND gag.tenant_id = _tenant_id
        AND (gag.expires_at IS NULL OR gag.expires_at > now())
    )
  )
$$;

-- 6) Update RLS policies to use single-argument versions
DROP POLICY IF EXISTS "PII access requires explicit grant or ownership" ON public.profiles_private;
CREATE POLICY "PII access requires explicit grant or ownership"
ON public.profiles_private
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND (
    (auth.uid() = user_id AND is_tenant_member(auth.uid(), tenant_id))
    OR has_pii_access(tenant_id)
  )
);

DROP POLICY IF EXISTS "Finance can view tenant payments" ON public.payments;
CREATE POLICY "Finance can view tenant payments"
ON public.payments
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  (user_id = auth.uid() AND is_tenant_member(auth.uid(), tenant_id))
  OR has_payment_access(tenant_id)
);

DROP POLICY IF EXISTS "Finance/admin can delete payments" ON public.payments;
CREATE POLICY "Finance/admin can delete payments"
ON public.payments
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND (is_tenant_admin(auth.uid(), tenant_id) OR has_payment_access(tenant_id))
);

DROP POLICY IF EXISTS "Finance/admin can insert payments" ON public.payments;
CREATE POLICY "Finance/admin can insert payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (is_tenant_admin(auth.uid(), tenant_id) OR has_payment_access(tenant_id))
);

DROP POLICY IF EXISTS "Finance/admin can update payments" ON public.payments;
CREATE POLICY "Finance/admin can update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND (is_tenant_admin(auth.uid(), tenant_id) OR has_payment_access(tenant_id))
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (is_tenant_admin(auth.uid(), tenant_id) OR has_payment_access(tenant_id))
);

DROP POLICY IF EXISTS "Users can view own active shift locations" ON public.shift_assignment_locations;
CREATE POLICY "Users can view own active shift locations"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id) 
  AND (
    (
      user_id = auth.uid() 
      AND EXISTS (
        SELECT 1
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        WHERE sa.id = shift_assignment_locations.assignment_id
          AND sa.user_id = auth.uid()
          AND (
            s.shift_date = CURRENT_DATE
            OR (sa.checkin_at IS NOT NULL AND sa.checkin_at > now() - interval '12 hours')
            OR (sa.checkout_at IS NOT NULL AND sa.checkout_at > now() - interval '12 hours')
          )
      )
    )
    OR has_gps_access(tenant_id)
  )
);

-- 7) Add function comments
COMMENT ON FUNCTION public.has_pii_access(uuid) IS 'Check if current user has PII access for tenant (single-arg version)';
COMMENT ON FUNCTION public.has_pii_access(uuid, uuid) IS 'Check if specific user has PII access for tenant (two-arg version for RPC)';
COMMENT ON FUNCTION public.has_payment_access(uuid) IS 'Check if current user has payment access for tenant (single-arg version)';
COMMENT ON FUNCTION public.has_payment_access(uuid, uuid) IS 'Check if specific user has payment access for tenant (two-arg version for RPC)';
COMMENT ON FUNCTION public.has_gps_access(uuid) IS 'Check if current user has GPS access for tenant (single-arg version)';
COMMENT ON FUNCTION public.has_gps_access(uuid, uuid) IS 'Check if specific user has GPS access for tenant (two-arg version for RPC)';