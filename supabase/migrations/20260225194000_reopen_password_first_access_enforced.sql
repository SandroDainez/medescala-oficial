-- Reopen password first-access flow:
-- - Every tenant starts with 123456
-- - First admin usage must force password change
-- - Super admin can view password/status per tenant

ALTER TABLE public.tenant_security_settings
  ADD COLUMN IF NOT EXISTS must_change_reopen_password boolean NOT NULL DEFAULT false;

-- Ensure all tenants have a security row with initial default password
INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password, must_change_reopen_password, updated_at)
SELECT t.id, '123456', true, now()
FROM public.tenants t
ON CONFLICT (tenant_id)
DO UPDATE SET
  schedule_reopen_password = '123456',
  must_change_reopen_password = true,
  updated_at = now();

-- Keep system-level fallback aligned
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'schedule_reopen_password',
  '123456',
  'Senha global padrão para reabertura (primeiro acesso por hospital)'
)
ON CONFLICT (setting_key)
DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = now();

-- Read current password status for a tenant (admin/super admin)
CREATE OR REPLACE FUNCTION public.get_tenant_reopen_password_status(_tenant_id uuid)
RETURNS TABLE(
  has_password boolean,
  current_password text,
  must_change boolean,
  updated_at timestamptz,
  updated_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    (s.schedule_reopen_password IS NOT NULL AND length(trim(s.schedule_reopen_password)) > 0) AS has_password,
    s.schedule_reopen_password AS current_password,
    COALESCE(s.must_change_reopen_password, false) AS must_change,
    s.updated_at,
    s.updated_by
  FROM public.tenant_security_settings s
  WHERE s.tenant_id = _tenant_id
    AND auth.uid() IS NOT NULL
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_tenant_admin(auth.uid(), _tenant_id)
    )
  LIMIT 1;
$$;

-- Save password and clear/define first-access flag
CREATE OR REPLACE FUNCTION public.set_schedule_reopen_password(
  _tenant_id uuid,
  _current_password text,
  _new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing text;
  _new_clean text := trim(COALESCE(_new_password, ''));
  _current_clean text := trim(COALESCE(_current_password, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), _tenant_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a senha';
  END IF;

  IF _new_clean IS NULL OR length(_new_clean) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter pelo menos 6 caracteres';
  END IF;

  SELECT s.schedule_reopen_password
  INTO _existing
  FROM public.tenant_security_settings s
  WHERE s.tenant_id = _tenant_id;

  IF _existing IS NOT NULL AND trim(_existing) <> '' THEN
    IF _current_clean = '' OR _current_clean <> trim(_existing) THEN
      RAISE EXCEPTION 'Senha atual incorreta';
    END IF;
  END IF;

  INSERT INTO public.tenant_security_settings (
    tenant_id,
    schedule_reopen_password,
    must_change_reopen_password,
    updated_by
  )
  VALUES (
    _tenant_id,
    _new_clean,
    (_new_clean = '123456'),
    auth.uid()
  )
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    schedule_reopen_password = EXCLUDED.schedule_reopen_password,
    must_change_reopen_password = EXCLUDED.must_change_reopen_password,
    updated_at = now(),
    updated_by = auth.uid();

  RETURN true;
END;
$$;

-- Extend super admin tenant listing with reopen password status
DROP FUNCTION IF EXISTS public.get_all_tenants_admin();
CREATE OR REPLACE FUNCTION public.get_all_tenants_admin()
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  billing_status text,
  is_unlimited boolean,
  trial_ends_at timestamptz,
  current_users_count integer,
  max_users integer,
  plan_name text,
  created_at timestamptz,
  admin_count bigint,
  plantonista_count bigint,
  sector_count bigint,
  active_shifts_30d bigint,
  paid_events_count bigint,
  pending_events_count bigint,
  last_paid_at timestamptz,
  reopen_password text,
  reopen_password_must_change boolean,
  reopen_password_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.billing_status,
    t.is_unlimited,
    t.trial_ends_at,
    t.current_users_count,
    p.max_users,
    p.name AS plan_name,
    t.created_at,
    COALESCE(mc.admin_count, 0) AS admin_count,
    COALESCE(mc.plantonista_count, 0) AS plantonista_count,
    COALESCE(sc.sector_count, 0) AS sector_count,
    COALESCE(sh.active_shifts_30d, 0) AS active_shifts_30d,
    COALESCE(be.paid_events_count, 0) AS paid_events_count,
    COALESCE(be.pending_events_count, 0) AS pending_events_count,
    be.last_paid_at,
    sec.schedule_reopen_password AS reopen_password,
    COALESCE(sec.must_change_reopen_password, false) AS reopen_password_must_change,
    sec.updated_at AS reopen_password_updated_at
  FROM public.tenants t
  LEFT JOIN public.plans p ON p.id = t.plan_id
  LEFT JOIN public.tenant_security_settings sec ON sec.tenant_id = t.id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT CASE WHEN m.active AND m.role = 'admin' THEN m.user_id END) AS admin_count,
      COUNT(
        DISTINCT CASE
          WHEN m.active AND COALESCE(NULLIF(trim(pr.profile_type), ''), 'plantonista') = 'plantonista' THEN m.user_id
          WHEN m.active AND m.role <> 'admin' THEN m.user_id
          ELSE NULL
        END
      ) AS plantonista_count
    FROM public.memberships m
    LEFT JOIN public.profiles pr ON pr.id = m.user_id
    WHERE m.tenant_id = t.id
  ) mc ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS sector_count
    FROM public.sectors s
    WHERE s.tenant_id = t.id
  ) sc ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS active_shifts_30d
    FROM public.shifts s
    WHERE s.tenant_id = t.id
      AND s.shift_date >= (CURRENT_DATE - 30)
  ) sh ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE e.status = 'paid') AS paid_events_count,
      COUNT(*) FILTER (WHERE e.status IN ('pending', 'overdue')) AS pending_events_count,
      MAX(e.paid_at) FILTER (WHERE e.status = 'paid') AS last_paid_at
    FROM public.tenant_billing_events e
    WHERE e.tenant_id = t.id
  ) be ON true
  WHERE public.is_super_admin(auth.uid())
  ORDER BY t.created_at DESC;
$$;

-- Ensure new tenants created by super admin start with 123456 and must_change=true
CREATE OR REPLACE FUNCTION public.super_admin_create_tenant(
  _name text,
  _slug text,
  _admin_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_admin_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can create tenants';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Nome do hospital/serviço é obrigatório';
  END IF;

  IF _slug IS NULL OR length(trim(_slug)) = 0 THEN
    RAISE EXCEPTION 'Código do hospital/serviço é obrigatório';
  END IF;

  INSERT INTO public.tenants (name, slug, plan_id, created_by, billing_status, trial_ends_at, is_unlimited)
  VALUES (
    trim(_name),
    lower(trim(_slug)),
    (
      SELECT p.id
      FROM public.plans p
      WHERE p.active = true
        AND p.min_users = 1
        AND p.max_users = 3
      ORDER BY p.created_at DESC
      LIMIT 1
    ),
    auth.uid(),
    'trial',
    (date_trunc('day', now() + interval '2 months') + interval '1 day' - interval '1 second')::timestamptz,
    false
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.memberships (tenant_id, user_id, role, active, created_by)
  VALUES (v_tenant_id, auth.uid(), 'admin', true, auth.uid())
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = 'admin',
        active = true,
        updated_at = now();

  IF _admin_email IS NOT NULL AND length(trim(_admin_email)) > 0 THEN
    SELECT au.id INTO v_admin_user_id
    FROM auth.users au
    WHERE lower(au.email) = lower(trim(_admin_email))
    LIMIT 1;

    IF v_admin_user_id IS NOT NULL THEN
      INSERT INTO public.memberships (tenant_id, user_id, role, active, created_by)
      VALUES (v_tenant_id, v_admin_user_id, 'admin', true, auth.uid())
      ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET role = 'admin',
            active = true,
            updated_at = now();
    END IF;
  END IF;

  INSERT INTO public.tenant_security_settings (
    tenant_id,
    schedule_reopen_password,
    must_change_reopen_password,
    updated_by
  )
  VALUES (v_tenant_id, '123456', true, auth.uid())
  ON CONFLICT (tenant_id) DO UPDATE
    SET schedule_reopen_password = EXCLUDED.schedule_reopen_password,
        must_change_reopen_password = EXCLUDED.must_change_reopen_password,
        updated_at = now(),
        updated_by = auth.uid();

  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_reopen_password_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_reopen_password_status(uuid) TO authenticated;
