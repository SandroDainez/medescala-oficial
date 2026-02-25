-- Super Admin Tenant Control Center
-- Adds:
-- - Rich tenant listing for super admin dashboard
-- - Tenant create/delete RPCs
-- - Admin contacts and activity summary RPCs
-- - Billing history table + RPCs
-- - update_tenant_access enhancements (clear trial date)

CREATE TABLE IF NOT EXISTS public.tenant_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reference_date date,
  due_date date,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'waived', 'cancelled')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.tenant_billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_billing_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can manage tenant billing events" ON public.tenant_billing_events;
CREATE POLICY "Super admins can manage tenant billing events"
ON public.tenant_billing_events
FOR ALL
USING (auth.uid() IS NOT NULL AND public.is_super_admin(auth.uid()))
WITH CHECK (auth.uid() IS NOT NULL AND public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS update_tenant_billing_events_updated_at ON public.tenant_billing_events;
CREATE TRIGGER update_tenant_billing_events_updated_at
BEFORE UPDATE ON public.tenant_billing_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
  last_paid_at timestamptz
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
    be.last_paid_at
  FROM public.tenants t
  LEFT JOIN public.plans p ON p.id = t.plan_id
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

DROP FUNCTION IF EXISTS public.update_tenant_access(uuid, text, boolean, timestamptz);
CREATE OR REPLACE FUNCTION public.update_tenant_access(
  _tenant_id uuid,
  _billing_status text DEFAULT NULL,
  _is_unlimited boolean DEFAULT NULL,
  _trial_ends_at timestamptz DEFAULT NULL,
  _clear_trial_ends_at boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can update tenant access';
  END IF;

  UPDATE public.tenants
  SET
    billing_status = COALESCE(_billing_status, billing_status),
    is_unlimited = COALESCE(_is_unlimited, is_unlimited),
    trial_ends_at = CASE
      WHEN COALESCE(_clear_trial_ends_at, false) THEN NULL
      ELSE COALESCE(_trial_ends_at, trial_ends_at)
    END,
    updated_at = now()
  WHERE id = _tenant_id;

  RETURN FOUND;
END;
$$;

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

  INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password, updated_by)
  VALUES (v_tenant_id, '123456', auth.uid())
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_delete_tenant(
  _tenant_id uuid,
  _confirm_slug text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_slug text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only app owners can delete tenants';
  END IF;

  SELECT slug INTO v_slug
  FROM public.tenants
  WHERE id = _tenant_id;

  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF lower(v_slug) = 'gabs' THEN
    RAISE EXCEPTION 'Tenant GABS é protegido e não pode ser removido';
  END IF;

  IF _confirm_slug IS NULL OR lower(trim(_confirm_slug)) <> lower(v_slug) THEN
    RAISE EXCEPTION 'Confirmação inválida. Informe o código do hospital para excluir.';
  END IF;

  DELETE FROM public.tenants
  WHERE id = _tenant_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_admin_contacts(_tenant_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  phone text,
  profile_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    m.user_id,
    COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.name), ''), 'Sem nome') AS full_name,
    COALESCE(NULLIF(trim(p.email), ''), au.email)::text AS email,
    NULLIF(trim(p.phone), '') AS phone,
    p.profile_type
  FROM public.memberships m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN auth.users au ON au.id = m.user_id
  WHERE m.tenant_id = _tenant_id
    AND m.active = true
    AND m.role = 'admin'
    AND public.is_super_admin(auth.uid())
  ORDER BY full_name;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_super_admin_details(_tenant_id uuid)
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  total_users bigint,
  admin_count bigint,
  plantonista_count bigint,
  sector_count bigint,
  active_shifts_30d bigint,
  plantonista_names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    COALESCE(stats.total_users, 0) AS total_users,
    COALESCE(stats.admin_count, 0) AS admin_count,
    COALESCE(stats.plantonista_count, 0) AS plantonista_count,
    COALESCE(sectors.sector_count, 0) AS sector_count,
    COALESCE(shifts.active_shifts_30d, 0) AS active_shifts_30d,
    COALESCE(plants.names, ARRAY[]::text[]) AS plantonista_names
  FROM public.tenants t
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT m.user_id) FILTER (WHERE m.active) AS total_users,
      COUNT(DISTINCT m.user_id) FILTER (WHERE m.active AND m.role = 'admin') AS admin_count,
      COUNT(DISTINCT m.user_id) FILTER (
        WHERE m.active AND (
          COALESCE(NULLIF(trim(p.profile_type), ''), 'plantonista') = 'plantonista'
          OR m.role <> 'admin'
        )
      ) AS plantonista_count
    FROM public.memberships m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE m.tenant_id = t.id
  ) stats ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS sector_count
    FROM public.sectors s
    WHERE s.tenant_id = t.id
  ) sectors ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS active_shifts_30d
    FROM public.shifts s
    WHERE s.tenant_id = t.id
      AND s.shift_date >= (CURRENT_DATE - 30)
  ) shifts ON true
  LEFT JOIN LATERAL (
    SELECT ARRAY(
      SELECT DISTINCT COALESCE(NULLIF(trim(p2.full_name), ''), NULLIF(trim(p2.name), ''), 'Sem nome')
      FROM public.memberships m2
      LEFT JOIN public.profiles p2 ON p2.id = m2.user_id
      WHERE m2.tenant_id = t.id
        AND m2.active = true
        AND (
          COALESCE(NULLIF(trim(p2.profile_type), ''), 'plantonista') = 'plantonista'
          OR m2.role <> 'admin'
        )
      ORDER BY 1
      LIMIT 300
    ) AS names
  ) plants ON true
  WHERE t.id = _tenant_id
    AND public.is_super_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_billing_events(_tenant_id uuid)
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  reference_date date,
  due_date date,
  amount numeric,
  status text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    e.id,
    e.tenant_id,
    e.reference_date,
    e.due_date,
    e.amount,
    e.status,
    e.paid_at,
    e.notes,
    e.created_at
  FROM public.tenant_billing_events e
  WHERE e.tenant_id = _tenant_id
    AND public.is_super_admin(auth.uid())
  ORDER BY COALESCE(e.reference_date, e.created_at::date) DESC, e.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.upsert_tenant_billing_event(
  _id uuid DEFAULT NULL,
  _tenant_id uuid DEFAULT NULL,
  _reference_date date DEFAULT NULL,
  _due_date date DEFAULT NULL,
  _amount numeric DEFAULT 0,
  _status text DEFAULT 'pending',
  _paid_at timestamptz DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can manage billing events';
  END IF;

  IF _id IS NULL THEN
    IF _tenant_id IS NULL THEN
      RAISE EXCEPTION 'tenant_id é obrigatório';
    END IF;

    INSERT INTO public.tenant_billing_events (
      tenant_id, reference_date, due_date, amount, status, paid_at, notes, created_by
    ) VALUES (
      _tenant_id, _reference_date, _due_date, COALESCE(_amount, 0), COALESCE(_status, 'pending'), _paid_at, _notes, auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.tenant_billing_events
    SET
      reference_date = COALESCE(_reference_date, reference_date),
      due_date = COALESCE(_due_date, due_date),
      amount = COALESCE(_amount, amount),
      status = COALESCE(_status, status),
      paid_at = CASE WHEN _status = 'paid' THEN COALESCE(_paid_at, paid_at, now()) ELSE _paid_at END,
      notes = COALESCE(_notes, notes),
      updated_at = now()
    WHERE id = _id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_tenant_billing_event(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can delete billing events';
  END IF;

  DELETE FROM public.tenant_billing_events
  WHERE id = _id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_tenants_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tenant_access(uuid, text, boolean, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.super_admin_create_tenant(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.super_admin_delete_tenant(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_admin_contacts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_super_admin_details(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_tenant_billing_events(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_tenant_billing_event(uuid, uuid, date, date, numeric, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_tenant_billing_event(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_all_tenants_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_access(uuid, text, boolean, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_create_tenant(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_delete_tenant(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_admin_contacts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_super_admin_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_billing_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_billing_event(uuid, uuid, date, date, numeric, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_billing_event(uuid) TO authenticated;
