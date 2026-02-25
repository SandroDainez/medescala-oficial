-- Subscription model update:
-- - Free testing: up to 3 users, trial up to 2 months
-- - Paid tiers by user ranges:
--   1-20, 21-50, 51-100, 101-150, 151-200, 200+
-- - Prices are placeholders (0) until business definition.

-- 1) Keep existing rows for history, but deactivate all current plans.
UPDATE public.plans
SET active = false,
    updated_at = now();

-- 2) Create the new active plan set.
INSERT INTO public.plans (name, min_users, max_users, price_monthly, active, features)
VALUES
  (
    'Teste Gratuito (3 usuários)',
    1,
    3,
    0,
    true,
    '["Até 3 usuários para teste", "Período de teste de até 2 meses", "Após o período, escolher plano de assinatura"]'::jsonb
  ),
  (
    'Plano 1-20 usuários',
    1,
    20,
    0,
    true,
    '["Plano de 1 a 20 usuários", "Valor de assinatura: a definir"]'::jsonb
  ),
  (
    'Plano 21-50 usuários',
    21,
    50,
    0,
    true,
    '["Plano de 21 a 50 usuários", "Valor de assinatura: a definir"]'::jsonb
  ),
  (
    'Plano 51-100 usuários',
    51,
    100,
    0,
    true,
    '["Plano de 51 a 100 usuários", "Valor de assinatura: a definir"]'::jsonb
  ),
  (
    'Plano 101-150 usuários',
    101,
    150,
    0,
    true,
    '["Plano de 101 a 150 usuários", "Valor de assinatura: a definir"]'::jsonb
  ),
  (
    'Plano 151-200 usuários',
    151,
    200,
    0,
    true,
    '["Plano de 151 a 200 usuários", "Valor de assinatura: a definir"]'::jsonb
  ),
  (
    'Plano 200+ usuários',
    201,
    999999,
    0,
    true,
    '["Plano para mais de 200 usuários", "Valor de assinatura: a definir"]'::jsonb
  );

-- 3) Re-map tenants to the new active tiers according to current active users.
--    This preserves tenant scale sizing while moving to the new model.
WITH target_plan AS (
  SELECT
    t.id AS tenant_id,
    COALESCE(
      (
        SELECT p.id
        FROM public.plans p
        WHERE p.active = true
          AND t.current_users_count BETWEEN p.min_users AND p.max_users
        ORDER BY p.max_users ASC
        LIMIT 1
      ),
      (
        SELECT p2.id
        FROM public.plans p2
        WHERE p2.active = true
          AND p2.min_users = 1
          AND p2.max_users = 3
        LIMIT 1
      )
    ) AS plan_id
  FROM public.tenants t
)
UPDATE public.tenants t
SET plan_id = tp.plan_id,
    updated_at = now()
FROM target_plan tp
WHERE t.id = tp.tenant_id
  AND tp.plan_id IS NOT NULL;

-- 4) Trial end calculation: up to 2 months from creation (end of day).
CREATE OR REPLACE FUNCTION public.calculate_trial_end_date()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT (date_trunc('day', now() + interval '2 months') + interval '1 day' - interval '1 second')::timestamptz
$$;

-- 5) Tenant creation must always use the free test plan and 2-month trial.
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

  IF lower(trim(_slug)) = 'gabs' THEN
    RAISE EXCEPTION 'Código reservado. Escolha outro código.';
  END IF;

  SELECT id INTO v_plan_id
  FROM public.plans
  WHERE active = true
    AND min_users = 1
    AND max_users = 3
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plano gratuito de teste não encontrado';
  END IF;

  v_trial_end := public.calculate_trial_end_date();

  INSERT INTO public.tenants (name, slug, plan_id, created_by, billing_status, trial_ends_at, is_unlimited)
  VALUES (trim(_name), lower(trim(_slug)), v_plan_id, auth.uid(), 'trial', v_trial_end, false)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.memberships (tenant_id, user_id, role, active, created_by)
  VALUES (v_tenant_id, auth.uid(), 'admin', true, auth.uid());

  INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password, updated_by)
  VALUES (v_tenant_id, NULL, auth.uid())
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN v_tenant_id;
END;
$$;
