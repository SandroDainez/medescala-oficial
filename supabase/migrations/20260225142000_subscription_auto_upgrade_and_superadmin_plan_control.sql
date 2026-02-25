-- Subscription alignment:
-- 1) Auto-upgrade tenant plan when active users exceed current tier.
-- 2) Allow tenant admin to request manual upgrade via RPC.
-- 3) Allow super admin to set tenant plan explicitly.

CREATE OR REPLACE FUNCTION public.auto_upgrade_tenant_plan(
  _tenant_id uuid,
  _target_users integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_current_users integer;
  v_target_users integer;
  v_current_plan_id uuid;
  v_current_plan_max integer;
  v_new_plan_id uuid;
  v_new_plan_max integer;
BEGIN
  SELECT t.current_users_count, t.plan_id, p.max_users
  INTO v_current_users, v_current_plan_id, v_current_plan_max
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_target_users := GREATEST(COALESCE(_target_users, v_current_users), v_current_users);

  -- No upgrade needed.
  IF v_target_users <= v_current_plan_max THEN
    RETURN false;
  END IF;

  -- For 4+ users, free trial plan (1..3) is no longer a valid target.
  SELECT p.id, p.max_users
  INTO v_new_plan_id, v_new_plan_max
  FROM public.plans p
  WHERE p.active = true
    AND p.max_users >= v_target_users
    AND NOT (v_target_users > 3 AND p.min_users = 1 AND p.max_users = 3)
  ORDER BY p.max_users ASC
  LIMIT 1;

  IF v_new_plan_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.tenants t
  SET
    plan_id = v_new_plan_id,
    billing_status = CASE
      WHEN v_new_plan_max > 3 AND t.billing_status <> 'cancelled' THEN 'active'
      ELSE t.billing_status
    END,
    trial_ends_at = CASE
      WHEN v_new_plan_max > 3 THEN NULL
      ELSE t.trial_ends_at
    END,
    updated_at = now()
  WHERE t.id = _tenant_id
    AND t.plan_id <> v_new_plan_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tenant_user_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_count integer;
BEGIN
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  SELECT COUNT(*)
  INTO v_count
  FROM public.memberships
  WHERE tenant_id = v_tenant_id
    AND active = true;

  UPDATE public.tenants
  SET current_users_count = COALESCE(v_count, 0),
      updated_at = now()
  WHERE id = v_tenant_id;

  -- Keep plan aligned with current active-user count.
  PERFORM public.auto_upgrade_tenant_plan(v_tenant_id, COALESCE(v_count, 0));

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_add_user_to_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_current_users integer;
  v_max_users integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (
    public.is_tenant_admin(auth.uid(), _tenant_id)
    OR public.is_super_admin(auth.uid())
  ) THEN
    RETURN false;
  END IF;

  SELECT t.current_users_count, p.max_users
  INTO v_current_users, v_max_users
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_current_users < v_max_users THEN
    RETURN true;
  END IF;

  -- Try auto-upgrade to fit one more user.
  PERFORM public.auto_upgrade_tenant_plan(_tenant_id, v_current_users + 1);

  SELECT t.current_users_count, p.max_users
  INTO v_current_users, v_max_users
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id;

  RETURN COALESCE(v_current_users < v_max_users, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.upgrade_tenant_plan(
  _tenant_id uuid,
  _plan_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_current_plan_max integer;
  v_target_plan_max integer;
  v_target_plan_min integer;
  v_current_users integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.is_tenant_admin(auth.uid(), _tenant_id)
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Apenas administradores do hospital/serviço podem alterar o plano';
  END IF;

  SELECT t.current_users_count, p.max_users
  INTO v_current_users, v_current_plan_max
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hospital/serviço não encontrado';
  END IF;

  SELECT p.max_users, p.min_users
  INTO v_target_plan_max, v_target_plan_min
  FROM public.plans p
  WHERE p.id = _plan_id
    AND p.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano inválido';
  END IF;

  IF v_target_plan_max < v_current_plan_max THEN
    RAISE EXCEPTION 'Não é permitido downgrade de plano por este fluxo';
  END IF;

  IF v_target_plan_max < v_current_users THEN
    RAISE EXCEPTION 'Plano selecionado não comporta a quantidade atual de usuários';
  END IF;

  UPDATE public.tenants t
  SET
    plan_id = _plan_id,
    billing_status = CASE
      WHEN v_target_plan_max > 3 AND t.billing_status <> 'cancelled' THEN 'active'
      ELSE t.billing_status
    END,
    trial_ends_at = CASE
      WHEN v_target_plan_max > 3 THEN NULL
      ELSE t.trial_ends_at
    END,
    updated_at = now()
  WHERE t.id = _tenant_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_set_tenant_plan(
  _tenant_id uuid,
  _plan_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_target_plan_max integer;
  v_current_users integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can set tenant plan';
  END IF;

  SELECT current_users_count INTO v_current_users
  FROM public.tenants
  WHERE id = _tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  SELECT p.max_users INTO v_target_plan_max
  FROM public.plans p
  WHERE p.id = _plan_id
    AND p.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano inválido';
  END IF;

  IF v_target_plan_max < v_current_users THEN
    RAISE EXCEPTION 'Plano selecionado não comporta os usuários atuais';
  END IF;

  UPDATE public.tenants t
  SET
    plan_id = _plan_id,
    billing_status = CASE
      WHEN v_target_plan_max > 3 AND t.billing_status <> 'cancelled' THEN 'active'
      ELSE t.billing_status
    END,
    trial_ends_at = CASE
      WHEN v_target_plan_max > 3 THEN NULL
      ELSE t.trial_ends_at
    END,
    updated_at = now()
  WHERE t.id = _tenant_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_upgrade_tenant_plan(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upgrade_tenant_plan(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.super_admin_set_tenant_plan(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auto_upgrade_tenant_plan(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_tenant_plan(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_set_tenant_plan(uuid, uuid) TO authenticated;
