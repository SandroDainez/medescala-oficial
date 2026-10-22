-- Dois assuntos ligados: a limpeza dos planos do modelo antigo e o desempate
-- que impedia a armadilha que eles carregavam.
--
-- Os planos desativados ("Gratuito" 1-1, "Profissional" 6-25 R$ 99,
-- "Enterprise" 26-100 R$ 299, "Enterprise Plus" 1-200 R$ 0 e "Unlimited"
-- 1-999999 R$ 0) eram restos de antes das faixas por número de usuários:
-- nenhum hospital os usava, nenhum aparecia no histórico e nenhuma linha de
-- código citava seus nomes. Mas continuavam com botão "Ativar" ao lado, e três
-- deles custavam R$ 0 com teto igual ou menor que o de planos pagos — um clique
-- errado colocaria serviços numa faixa gratuita sem erro nenhum aparecer.

DELETE FROM public.plans p
WHERE p.active = false
  AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.plan_id = p.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_plan_changes c
    WHERE c.from_plan_id = p.id OR c.to_plan_id = p.id
  );

-- Mesmo sem esses planos, dois planos futuros podem acabar com o mesmo teto.
-- Sem desempate explícito a escolha ficava a cargo do banco, e o mais barato
-- podia ser servido no lugar do pago: o serviço migrava de faixa e parava de
-- ser cobrado, em silêncio. A mesma ordenação vale em src/lib/planoDoServico.ts.
CREATE OR REPLACE FUNCTION public.auto_upgrade_tenant_plan(
  _tenant_id uuid,
  _target_users integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_users integer;
  v_target_users integer;
  v_current_plan_id uuid;
  v_current_plan_max integer;
  v_new_plan_id uuid;
  v_new_plan_max integer;
  v_rows integer;
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

  IF v_target_users <= v_current_plan_max THEN
    RETURN false;
  END IF;

  SELECT p.id, p.max_users
  INTO v_new_plan_id, v_new_plan_max
  FROM public.plans p
  WHERE p.active = true
    AND p.max_users >= v_target_users
    AND NOT (v_target_users > 3 AND p.min_users = 1 AND p.max_users = 3)
  ORDER BY p.max_users ASC, p.price_monthly DESC NULLS LAST, p.id ASC
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

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    PERFORM public.record_tenant_plan_change(
      _tenant_id, v_current_plan_id, v_new_plan_id, v_target_users, 'automatico'
    );
  END IF;

  RETURN v_rows > 0;
END;
$function$;
