-- =====================================================
-- 1. FIX SHIFTS RLS - Only sector members can view (no assignment exception)
-- =====================================================

-- Drop the old policy that allowed assignment-based access
DROP POLICY IF EXISTS "Users can view shifts in their sectors" ON public.shifts;

-- Create new policy: users can only view shifts in sectors they are members of
CREATE POLICY "Users can view shifts in their sectors"
ON public.shifts
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND (
    -- Tenant admins can see all shifts in tenant
    is_tenant_admin(auth.uid(), tenant_id)
    OR
    -- Regular users can only see shifts in sectors they are members of
    (
      is_tenant_member(auth.uid(), tenant_id) 
      AND (
        sector_id IS NULL 
        OR EXISTS (
          SELECT 1 FROM public.sector_memberships sm
          WHERE sm.sector_id = shifts.sector_id 
            AND sm.user_id = auth.uid() 
            AND sm.tenant_id = shifts.tenant_id
        )
      )
    )
  )
);

-- =====================================================
-- 2. GPS ACCESS AUDIT LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.gps_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);

-- Enable RLS
ALTER TABLE public.gps_access_logs ENABLE ROW LEVEL SECURITY;

-- No direct client access - only super admins can view audit logs
CREATE POLICY "Super admins can view gps access logs"
ON public.gps_access_logs
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Block all other access
CREATE POLICY "Block all anon access on gps_access_logs"
ON public.gps_access_logs
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- =====================================================
-- 3. CREATE RPC FOR ADMIN TO QUERY GPS WITH AUDIT
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_assignment_location_with_audit(
  _assignment_id uuid,
  _tenant_id uuid
)
RETURNS TABLE (
  assignment_id uuid,
  user_id uuid,
  tenant_id uuid,
  checkin_latitude numeric,
  checkin_longitude numeric,
  checkout_latitude numeric,
  checkout_longitude numeric,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id uuid;
BEGIN
  -- Verify caller is tenant admin
  IF NOT is_tenant_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get target user id for audit
  SELECT sal.user_id INTO v_target_user_id
  FROM public.shift_assignment_locations sal
  WHERE sal.assignment_id = _assignment_id AND sal.tenant_id = _tenant_id
  LIMIT 1;

  -- Log the access if location exists and admin is not the owner
  IF v_target_user_id IS NOT NULL AND v_target_user_id != auth.uid() THEN
    INSERT INTO public.gps_access_logs (admin_user_id, target_user_id, assignment_id, tenant_id)
    VALUES (auth.uid(), v_target_user_id, _assignment_id, _tenant_id);
  END IF;

  -- Return the location data
  RETURN QUERY
  SELECT 
    sal.assignment_id,
    sal.user_id,
    sal.tenant_id,
    sal.checkin_latitude,
    sal.checkin_longitude,
    sal.checkout_latitude,
    sal.checkout_longitude,
    sal.created_at,
    sal.updated_at
  FROM public.shift_assignment_locations sal
  WHERE sal.assignment_id = _assignment_id AND sal.tenant_id = _tenant_id;
END;
$$;

-- =====================================================
-- 4. NOTIFICATION CLEANUP FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < now() - interval '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;