-- Fix plan consistency:
-- - When super admin sets a plan, remove unlimited mode.
-- - Align GABS with a regular plan tier (201+), not unlimited.
-- - Rename "200+" tier to "201+" to match product wording.

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
    is_unlimited = false,
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

-- Keep naming consistent with the business rule (201+).
UPDATE public.plans
SET name = 'Plano 201+ usuários',
    updated_at = now()
WHERE active = true
  AND min_users = 201
  AND max_users >= 999999
  AND name = 'Plano 200+ usuários';

-- Align GABS from unlimited to regular tiered plan.
WITH target_plan AS (
  SELECT id
  FROM public.plans
  WHERE active = true
    AND min_users = 201
    AND max_users >= 999999
  ORDER BY created_at DESC
  LIMIT 1
)
UPDATE public.tenants t
SET
  plan_id = tp.id,
  is_unlimited = false,
  billing_status = 'active',
  trial_ends_at = NULL,
  updated_at = now()
FROM target_plan tp
WHERE lower(t.slug) = 'gabs'
  AND tp.id IS NOT NULL;

