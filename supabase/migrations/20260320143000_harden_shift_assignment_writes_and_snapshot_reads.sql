BEGIN;

-- Direct client writes must not mutate financial snapshot rows.
-- All inserts/updates must go through SECURITY DEFINER RPCs.
REVOKE INSERT, UPDATE ON public.shift_assignments FROM anon;
REVOKE INSERT, UPDATE ON public.shift_assignments FROM authenticated;

CREATE OR REPLACE FUNCTION public.enforce_plantonista_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_is_eligible boolean;
BEGIN
  v_tenant_id := COALESCE(
    NEW.tenant_id,
    (
      SELECT s.tenant_id
      FROM public.shifts s
      WHERE s.id = NEW.shift_id
      LIMIT 1
    )
  );

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o tenant da atribuição';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.profiles p
      ON p.id = m.user_id
    WHERE m.tenant_id = v_tenant_id
      AND m.user_id = NEW.user_id
      AND m.active = true
      AND m.role <> 'admin'
      AND m.role <> 'owner'
      AND p.profile_type = 'plantonista'
  )
  INTO v_is_eligible;

  IF NOT v_is_eligible THEN
    RAISE EXCEPTION 'Somente plantonistas ativos do tenant podem ser atribuídos à escala';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_plantonista_assignment() IS
'Valida elegibilidade do usuário atribuído sem impedir fluxos administrativos executados via RPC SECURITY DEFINER.';

COMMIT;
