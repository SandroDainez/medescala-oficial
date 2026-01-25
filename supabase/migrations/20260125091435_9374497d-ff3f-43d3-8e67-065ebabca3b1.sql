-- =====================================================
-- SECURITY HARDENING: payments + shift_assignment_locations
-- =====================================================

-- 1. Create gps_access_grants table for temporal GPS access
CREATE TABLE IF NOT EXISTS public.gps_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gps_access_grants_unique UNIQUE (tenant_id, user_id)
);

-- Enable RLS on gps_access_grants
ALTER TABLE public.gps_access_grants ENABLE ROW LEVEL SECURITY;

-- Block anon access
CREATE POLICY "Block anon access on gps_access_grants"
ON public.gps_access_grants AS RESTRICTIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

-- Only super admins can manage GPS grants
CREATE POLICY "Super admins can manage gps_access_grants"
ON public.gps_access_grants FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant admins can view grants in their tenant
CREATE POLICY "Tenant admins can view gps_access_grants"
ON public.gps_access_grants FOR SELECT TO authenticated
USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- 2. Create has_gps_access function (strict: temporal grant + tenant + no bypass)
CREATE OR REPLACE FUNCTION public.has_gps_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Super admin with explicit temporal grant only
    (
      public.is_super_admin(_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.gps_access_grants gag
        WHERE gag.user_id = _user_id
          AND gag.tenant_id = _tenant_id
          AND (gag.expires_at IS NULL OR gag.expires_at > now())
      )
    )
    OR
    -- Non-super-admin with temporal grant
    EXISTS (
      SELECT 1
      FROM public.gps_access_grants gag
      WHERE gag.user_id = _user_id
        AND gag.tenant_id = _tenant_id
        AND (gag.expires_at IS NULL OR gag.expires_at > now())
    )
  )
$$;

-- 3. Update has_payment_access to be stricter (remove has_gabs_bypass)
CREATE OR REPLACE FUNCTION public.has_payment_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Super admin with explicit temporal grant
    (
      public.is_super_admin(_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.payment_access_permissions pap
        WHERE pap.user_id = _user_id
          AND pap.tenant_id = _tenant_id
          AND (pap.expires_at IS NULL OR pap.expires_at > now())
      )
    )
    OR
    -- Temporal grant with expiration check
    EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND (pap.expires_at IS NULL OR pap.expires_at > now())
    )
  )
$$;

-- 4. Update shift_assignment_locations policies

-- Drop existing broad policies
DROP POLICY IF EXISTS "Users can view own locations (30 days)" ON public.shift_assignment_locations;
DROP POLICY IF EXISTS "Tenant admins can view all locations" ON public.shift_assignment_locations;

-- New policy: Users can only view their own GPS from active shifts (12h window)
CREATE POLICY "Users can view own active shift locations"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- Own location from shifts in 12h window (before/after shift)
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.shift_assignments sa
        JOIN public.shifts s ON s.id = sa.shift_id
        WHERE sa.id = shift_assignment_locations.assignment_id
          AND sa.user_id = auth.uid()
          AND (
            -- Shift is today or checkin/checkout within 12h
            s.shift_date = CURRENT_DATE
            OR (sa.checkin_at IS NOT NULL AND sa.checkin_at > now() - interval '12 hours')
            OR (sa.checkout_at IS NOT NULL AND sa.checkout_at > now() - interval '12 hours')
          )
      )
    )
    OR
    -- Explicit GPS grant (temporal, audited)
    public.has_gps_access(auth.uid(), tenant_id)
  )
);

-- 5. Audit trigger for GPS grants
CREATE OR REPLACE FUNCTION public.log_gps_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pii_audit_logs (
    table_name, record_id, user_id, tenant_id, action, new_data
  ) VALUES (
    'gps_access_grants',
    NEW.id::text,
    auth.uid(),
    NEW.tenant_id,
    'GPS_GRANT_CREATED',
    jsonb_build_object(
      'granted_to', NEW.user_id,
      'expires_at', NEW.expires_at,
      'reason', NEW.reason
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_gps_grant_trigger ON public.gps_access_grants;
CREATE TRIGGER log_gps_grant_trigger
  AFTER INSERT ON public.gps_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.log_gps_grant();

-- 6. Audit trigger for payment grants (if not exists)
DROP TRIGGER IF EXISTS log_pii_grant_trigger ON public.payment_access_permissions;
CREATE TRIGGER log_payment_grant_trigger
  AFTER INSERT ON public.payment_access_permissions
  FOR EACH ROW EXECUTE FUNCTION public.log_pii_grant();

-- 7. Add comments
COMMENT ON TABLE public.gps_access_grants IS 'Grants temporais para acesso a dados GPS. Requer expires_at e reason. Super admins precisam de grant explícito.';
COMMENT ON FUNCTION public.has_gps_access IS 'Verifica grant temporal para GPS. NÃO usa has_gabs_bypass - requer grant explícito mesmo para super admins.';
COMMENT ON FUNCTION public.has_payment_access IS 'Verifica grant temporal para pagamentos. NÃO usa has_gabs_bypass - requer grant explícito mesmo para super admins.';