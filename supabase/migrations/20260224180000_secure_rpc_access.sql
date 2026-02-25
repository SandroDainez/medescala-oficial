-- Revoke anon access for sensitive RPCs
REVOKE ALL ON FUNCTION public.get_tenant_access_status(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_tenant_subscription(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_tenants(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_add_user_to_tenant(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.verify_schedule_reopen_password(text) FROM anon;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM anon;

-- Require tenant membership or super admin for access status
CREATE OR REPLACE FUNCTION public.get_tenant_access_status(_tenant_id uuid)
RETURNS TABLE(status text, is_unlimited boolean, trial_ends_at timestamptz, days_remaining integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    t.billing_status,
    t.is_unlimited,
    t.trial_ends_at,
    CASE 
      WHEN t.is_unlimited THEN NULL
      WHEN t.trial_ends_at IS NULL THEN 0
      ELSE GREATEST(0, EXTRACT(DAY FROM (t.trial_ends_at - NOW()))::integer)
    END
  FROM public.tenants t
  WHERE t.id = _tenant_id
    AND (
      public.is_tenant_member(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    );
$$;

-- Require tenant membership or super admin for subscription details
CREATE OR REPLACE FUNCTION public.get_tenant_subscription(_tenant_id uuid)
RETURNS TABLE(plan_name text, max_users integer, current_users integer, price_monthly numeric, billing_status text, trial_ends_at timestamptz, features jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    p.name,
    p.max_users,
    t.current_users_count,
    p.price_monthly,
    t.billing_status,
    t.trial_ends_at,
    p.features
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id
    AND (
      public.is_tenant_member(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    );
$$;

-- Only allow caller to fetch their own tenants (or super admin)
CREATE OR REPLACE FUNCTION public.get_user_tenants(_user_id uuid)
RETURNS TABLE(tenant_id uuid, tenant_name text, role public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.tenant_id, t.name, m.role
  FROM public.memberships m
  JOIN public.tenants t ON t.id = m.tenant_id
  WHERE m.user_id = _user_id
    AND m.active = true
    AND (
      _user_id = auth.uid()
      OR public.is_super_admin(auth.uid())
    );
$$;

-- Only tenant admin or super admin can check plan capacity
CREATE OR REPLACE FUNCTION public.can_add_user_to_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    t.current_users_count < p.max_users
    AND (
      public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    )
  )
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id;
$$;

-- Require authenticated admin/super-admin to validate schedule reopen password
CREATE OR REPLACE FUNCTION public.verify_schedule_reopen_password(_password text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings
    WHERE setting_key = 'schedule_reopen_password'
      AND setting_value = _password
  )
  AND auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.active = true
        AND m.role = 'admin'
    )
  );
$$;
