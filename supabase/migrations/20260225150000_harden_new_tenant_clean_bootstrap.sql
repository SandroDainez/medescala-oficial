-- Ensure every new tenant starts from a clean environment:
-- - no GABS special flags by slug
-- - no copied operational data
-- - bootstrap only tenant-scoped settings skeleton

CREATE OR REPLACE FUNCTION public.create_tenant_with_admin(_name text, _slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_plan_id uuid;
  v_trial_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Nome do hospital/serviço é obrigatório';
  END IF;

  IF _slug IS NULL OR length(trim(_slug)) = 0 THEN
    RAISE EXCEPTION 'Código do hospital/serviço é obrigatório';
  END IF;

  -- Reserve internal slug and avoid accidental "special tenant" behavior.
  IF lower(trim(_slug)) = 'gabs' THEN
    RAISE EXCEPTION 'Código reservado. Escolha outro código.';
  END IF;

  SELECT id INTO v_plan_id
  FROM public.plans
  WHERE active = true AND name = 'Gratuito'
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Default plan not found';
  END IF;

  v_trial_end := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 second')::timestamptz;

  -- Clean tenant creation: only tenant row + admin membership.
  INSERT INTO public.tenants (name, slug, plan_id, created_by, billing_status, trial_ends_at, is_unlimited)
  VALUES (trim(_name), lower(trim(_slug)), v_plan_id, auth.uid(), 'trial', v_trial_end, false)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.memberships (tenant_id, user_id, role, active, created_by)
  VALUES (v_tenant_id, auth.uid(), 'admin', true, auth.uid());

  -- Bootstrap settings container only (no business data copy).
  INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password, updated_by)
  VALUES (v_tenant_id, NULL, auth.uid())
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN v_tenant_id;
END;
$$;

