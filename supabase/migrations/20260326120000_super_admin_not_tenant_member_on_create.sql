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
  v_plan_id uuid;
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

  SELECT p.id
  INTO v_plan_id
  FROM public.plans p
  WHERE p.active = true
    AND p.min_users = 1
    AND p.max_users = 3
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plano gratuito de teste não encontrado';
  END IF;

  INSERT INTO public.tenants (name, slug, plan_id, created_by, billing_status, trial_ends_at, is_unlimited)
  VALUES (
    trim(_name),
    lower(trim(_slug)),
    v_plan_id,
    auth.uid(),
    'trial',
    public.calculate_trial_end_date(),
    false
  )
  RETURNING id INTO v_tenant_id;

  IF _admin_email IS NOT NULL AND length(trim(_admin_email)) > 0 THEN
    SELECT au.id
    INTO v_admin_user_id
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
