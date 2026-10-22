-- Histórico de mudança de plano.
--
-- O plano de um hospital já sobe sozinho quando ele passa do número de usuários
-- (trigger on_membership_change -> auto_upgrade_tenant_plan). O que faltava era
-- registro: a troca acontecia em silêncio, e no mês seguinte ninguém sabia dizer
-- quando o hospital mudou de faixa nem quanto passou a valer a cobrança.
--
-- Guardamos o preço dos dois planos no momento da troca de propósito: se a
-- tabela de preços mudar depois, o histórico continua contando a verdade do dia.

CREATE TABLE IF NOT EXISTS public.tenant_plan_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_plan_id uuid REFERENCES public.plans(id),
  to_plan_id uuid NOT NULL REFERENCES public.plans(id),
  from_plan_name text,
  to_plan_name text NOT NULL,
  from_price_monthly numeric,
  to_price_monthly numeric,
  users_count integer NOT NULL,
  origin text NOT NULL CHECK (origin IN ('automatico', 'super_admin', 'admin_hospital')),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_plan_changes_tenant_idx
  ON public.tenant_plan_changes (tenant_id, changed_at DESC);

ALTER TABLE public.tenant_plan_changes ENABLE ROW LEVEL SECURITY;

-- Só leitura, e só de quem é do hospital (ou super admin). A escrita acontece
-- exclusivamente dentro das funções SECURITY DEFINER abaixo.
DROP POLICY IF EXISTS tenant_plan_changes_select ON public.tenant_plan_changes;
CREATE POLICY tenant_plan_changes_select ON public.tenant_plan_changes
  FOR SELECT
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    OR public.is_super_admin(auth.uid())
  );

-- Registra a troca. Chamada pelas três funções que mexem em tenants.plan_id.
CREATE OR REPLACE FUNCTION public.record_tenant_plan_change(
  _tenant_id uuid,
  _from_plan_id uuid,
  _to_plan_id uuid,
  _users_count integer,
  _origin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _from_plan_id IS NOT DISTINCT FROM _to_plan_id THEN
    RETURN;
  END IF;

  INSERT INTO public.tenant_plan_changes (
    tenant_id, from_plan_id, to_plan_id,
    from_plan_name, to_plan_name,
    from_price_monthly, to_price_monthly,
    users_count, origin, changed_by
  )
  SELECT
    _tenant_id, _from_plan_id, _to_plan_id,
    (SELECT name FROM public.plans WHERE id = _from_plan_id),
    (SELECT name FROM public.plans WHERE id = _to_plan_id),
    (SELECT price_monthly FROM public.plans WHERE id = _from_plan_id),
    (SELECT price_monthly FROM public.plans WHERE id = _to_plan_id),
    COALESCE(_users_count, 0), _origin, auth.uid();
END;
$function$;

-- auto_upgrade_tenant_plan: mesma lógica de antes, agora deixando rastro.
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

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    PERFORM public.record_tenant_plan_change(
      _tenant_id, v_current_plan_id, v_new_plan_id, v_target_users, 'automatico'
    );
  END IF;

  RETURN v_rows > 0;
END;
$function$;

-- super_admin_set_tenant_plan: idem, registrando quem mudou.
CREATE OR REPLACE FUNCTION public.super_admin_set_tenant_plan(_tenant_id uuid, _plan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target_plan_max integer;
  v_current_users integer;
  v_current_plan_id uuid;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can set tenant plan';
  END IF;

  SELECT current_users_count, plan_id INTO v_current_users, v_current_plan_id
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

  -- O FOUND tinha que ser lido aqui: um PERFORM no meio o sobrescreveria e a
  -- função passaria a devolver o resultado do registro, não o da troca.
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  PERFORM public.record_tenant_plan_change(
    _tenant_id, v_current_plan_id, _plan_id, v_current_users, 'super_admin'
  );

  RETURN v_rows > 0;
END;
$function$;

-- O hospital não escolhe mais plano: ele acompanha o número de usuários. A tela
-- de Assinatura deixou de oferecer a troca, e deixar a função aberta ao admin do
-- hospital permitiria, por chamada direta, pular para a faixa de 201+ usuários
-- (R$ 2.000/mês) sem nenhum usuário novo. Só super admin daqui em diante.
CREATE OR REPLACE FUNCTION public.upgrade_tenant_plan(_tenant_id uuid, _plan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'O plano acompanha o número de usuários do serviço. Para mudar de faixa, fale com o MedEscala.';
  END IF;

  RETURN public.super_admin_set_tenant_plan(_tenant_id, _plan_id);
END;
$function$;

-- Leitura do histórico, para o painel do super admin e para a tela do hospital.
CREATE OR REPLACE FUNCTION public.list_tenant_plan_changes(_tenant_id uuid)
RETURNS TABLE(
  id uuid,
  from_plan_name text,
  to_plan_name text,
  from_price_monthly numeric,
  to_price_monthly numeric,
  users_count integer,
  origin text,
  changed_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.from_plan_name,
    c.to_plan_name,
    c.from_price_monthly,
    c.to_price_monthly,
    c.users_count,
    c.origin,
    c.changed_at
  FROM public.tenant_plan_changes c
  WHERE c.tenant_id = _tenant_id
    AND (
      public.is_tenant_member(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    )
  ORDER BY c.changed_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.list_tenant_plan_changes(uuid) TO authenticated;
