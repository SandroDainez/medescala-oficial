BEGIN;

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS value_source text,
  ADD COLUMN IF NOT EXISTS value_snapshot_meta jsonb,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

UPDATE public.shift_assignments
SET
  value_snapshot_meta = COALESCE(value_snapshot_meta, '{}'::jsonb),
  assigned_at = COALESCE(assigned_at, created_at, now())
WHERE value_snapshot_meta IS NULL
   OR assigned_at IS NULL;

ALTER TABLE public.shift_assignments
  ALTER COLUMN value_snapshot_meta SET DEFAULT '{}'::jsonb,
  ALTER COLUMN value_snapshot_meta SET NOT NULL,
  ALTER COLUMN assigned_at SET DEFAULT now(),
  ALTER COLUMN assigned_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.resolve_assignment_snapshot_value(
  _tenant_id uuid,
  _shift_id uuid,
  _user_id uuid,
  _manual_value numeric DEFAULT NULL,
  _performed_by uuid DEFAULT auth.uid()
)
RETURNS TABLE(
  assigned_value numeric,
  value_source text,
  value_snapshot_meta jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift record;
  v_membership_role text;
  v_profile_type text;
  v_sector_day_value numeric;
  v_sector_night_value numeric;
  v_individual_day_value numeric;
  v_individual_night_value numeric;
  v_individual_source text;
  v_effective_base numeric;
  v_duration_hours numeric;
  v_is_night boolean;
  v_shift_month integer;
  v_shift_year integer;
  v_calculated_value numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF _tenant_id IS NULL OR _shift_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id, shift_id e user_id são obrigatórios';
  END IF;

  IF _performed_by IS NULL OR _performed_by <> auth.uid() THEN
    RAISE EXCEPTION 'performed_by deve ser o usuário autenticado';
  END IF;

  IF _manual_value IS NOT NULL AND _manual_value < 0 THEN
    RAISE EXCEPTION 'manual_value não pode ser negativo';
  END IF;

  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Usuário autenticado não pertence ao tenant informado';
  END IF;

  IF auth.uid() <> _user_id
     AND NOT public.is_tenant_admin(auth.uid(), _tenant_id)
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.has_gabs_bypass(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para resolver snapshot para outro usuário';
  END IF;

  SELECT
    s.id,
    s.tenant_id,
    s.sector_id,
    s.shift_date,
    s.start_time,
    s.end_time,
    s.base_value,
    sec.default_day_value AS sector_day_value,
    sec.default_night_value AS sector_night_value
  INTO v_shift
  FROM public.shifts s
  LEFT JOIN public.sectors sec
    ON sec.id = s.sector_id
   AND sec.tenant_id = s.tenant_id
  WHERE s.id = _shift_id
    AND s.tenant_id = _tenant_id
  LIMIT 1;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'Plantão não encontrado para o tenant informado';
  END IF;

  SELECT m.role
  INTO v_membership_role
  FROM public.memberships m
  WHERE m.tenant_id = _tenant_id
    AND m.user_id = _user_id
    AND m.active = true
  LIMIT 1;

  IF v_membership_role IS NULL THEN
    RAISE EXCEPTION 'Usuário destino não pertence ativamente ao tenant';
  END IF;

  IF v_membership_role IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Usuário destino não pode receber atribuições de escala';
  END IF;

  SELECT p.profile_type
  INTO v_profile_type
  FROM public.profiles p
  WHERE p.id = _user_id
  LIMIT 1;

  IF COALESCE(NULLIF(trim(v_profile_type), ''), 'plantonista') <> 'plantonista' THEN
    RAISE EXCEPTION 'Usuário destino não é um plantonista elegível';
  END IF;

  IF v_shift.sector_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sector_memberships sm
    WHERE sm.tenant_id = _tenant_id
      AND sm.sector_id = v_shift.sector_id
      AND sm.user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Usuário destino não pertence ao setor do plantão';
  END IF;

  v_shift_month := EXTRACT(MONTH FROM v_shift.shift_date)::int;
  v_shift_year := EXTRACT(YEAR FROM v_shift.shift_date)::int;
  v_is_night :=
    split_part(v_shift.start_time::text, ':', 1)::int >= 19
    OR split_part(v_shift.start_time::text, ':', 1)::int < 7;

  v_duration_hours := EXTRACT(EPOCH FROM
    CASE
      WHEN v_shift.end_time > v_shift.start_time THEN
        (v_shift.end_time - v_shift.start_time)
      WHEN v_shift.end_time = v_shift.start_time THEN
        interval '24 hours'
      ELSE
        ((v_shift.end_time + interval '24 hours') - v_shift.start_time)
    END
  ) / 3600.0;

  IF _manual_value IS NOT NULL THEN
    assigned_value := round(_manual_value::numeric, 2);
    value_source := 'manual';
    value_snapshot_meta := jsonb_build_object(
      'source', 'manual',
      'manual_value', round(_manual_value::numeric, 2),
      'tenant_id', _tenant_id,
      'shift_id', _shift_id,
      'user_id', _user_id,
      'sector_id', v_shift.sector_id,
      'shift_date', v_shift.shift_date,
      'start_time', v_shift.start_time,
      'end_time', v_shift.end_time,
      'duration_hours', v_duration_hours,
      'is_night', v_is_night,
      'competence_month', v_shift_month,
      'competence_year', v_shift_year,
      'resolved_at', now(),
      'resolved_by', _performed_by
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_shift.sector_id IS NOT NULL THEN
    SELECT
      uv.day_value,
      uv.night_value,
      CASE
        WHEN uv.month IS NOT NULL AND uv.year IS NOT NULL THEN 'competence'
        ELSE 'global'
      END
    INTO
      v_individual_day_value,
      v_individual_night_value,
      v_individual_source
    FROM public.user_sector_values uv
    WHERE uv.tenant_id = _tenant_id
      AND uv.user_id = _user_id
      AND uv.sector_id = v_shift.sector_id
      AND (
        (uv.month = v_shift_month AND uv.year = v_shift_year)
        OR (uv.month IS NULL AND uv.year IS NULL)
      )
    ORDER BY
      CASE WHEN uv.month = v_shift_month AND uv.year = v_shift_year THEN 0 ELSE 1 END,
      uv.updated_at DESC NULLS LAST,
      uv.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  v_effective_base := CASE WHEN v_is_night THEN v_individual_night_value ELSE v_individual_day_value END;

  IF v_effective_base IS NOT NULL THEN
    v_calculated_value := round(((v_effective_base / 12.0) * v_duration_hours)::numeric, 2);
    assigned_value := v_calculated_value;
    value_source := 'individual';
    value_snapshot_meta := jsonb_build_object(
      'source', 'individual',
      'individual_scope', COALESCE(v_individual_source, 'unknown'),
      'individual_day_value', v_individual_day_value,
      'individual_night_value', v_individual_night_value,
      'base_value_used', v_effective_base,
      'tenant_id', _tenant_id,
      'shift_id', _shift_id,
      'user_id', _user_id,
      'sector_id', v_shift.sector_id,
      'shift_date', v_shift.shift_date,
      'start_time', v_shift.start_time,
      'end_time', v_shift.end_time,
      'duration_hours', v_duration_hours,
      'is_night', v_is_night,
      'competence_month', v_shift_month,
      'competence_year', v_shift_year,
      'resolved_at', now(),
      'resolved_by', _performed_by
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_shift.base_value IS NOT NULL THEN
    assigned_value := round(v_shift.base_value::numeric, 2);
    value_source := 'shift_base';
    value_snapshot_meta := jsonb_build_object(
      'source', 'shift_base',
      'shift_base_value', round(v_shift.base_value::numeric, 2),
      'tenant_id', _tenant_id,
      'shift_id', _shift_id,
      'user_id', _user_id,
      'sector_id', v_shift.sector_id,
      'shift_date', v_shift.shift_date,
      'start_time', v_shift.start_time,
      'end_time', v_shift.end_time,
      'duration_hours', v_duration_hours,
      'is_night', v_is_night,
      'competence_month', v_shift_month,
      'competence_year', v_shift_year,
      'resolved_at', now(),
      'resolved_by', _performed_by
    );
    RETURN NEXT;
    RETURN;
  END IF;

  v_sector_day_value := v_shift.sector_day_value;
  v_sector_night_value := v_shift.sector_night_value;
  v_effective_base := CASE WHEN v_is_night THEN v_sector_night_value ELSE v_sector_day_value END;

  IF v_effective_base IS NOT NULL THEN
    v_calculated_value := round(((v_effective_base / 12.0) * v_duration_hours)::numeric, 2);
    assigned_value := v_calculated_value;
    value_source := 'sector_default';
    value_snapshot_meta := jsonb_build_object(
      'source', 'sector_default',
      'sector_day_value', v_sector_day_value,
      'sector_night_value', v_sector_night_value,
      'base_value_used', v_effective_base,
      'tenant_id', _tenant_id,
      'shift_id', _shift_id,
      'user_id', _user_id,
      'sector_id', v_shift.sector_id,
      'shift_date', v_shift.shift_date,
      'start_time', v_shift.start_time,
      'end_time', v_shift.end_time,
      'duration_hours', v_duration_hours,
      'is_night', v_is_night,
      'competence_month', v_shift_month,
      'competence_year', v_shift_year,
      'resolved_at', now(),
      'resolved_by', _performed_by
    );
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Não foi possível resolver valor financeiro para a atribuição. Defina valor manual, individual, base do plantão ou padrão do setor.';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_assignment_snapshot_value(uuid, uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_assignment_snapshot_value(uuid, uuid, uuid, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_assignment_snapshot_value(uuid, uuid, uuid, numeric, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_assignment_snapshot_value(uuid, uuid, uuid, numeric, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_assignment_with_snapshot(
  _tenant_id uuid,
  _shift_id uuid,
  _user_id uuid,
  _manual_value numeric DEFAULT NULL,
  _status text DEFAULT 'assigned',
  _performed_by uuid DEFAULT auth.uid()
)
RETURNS TABLE(
  assignment_id uuid,
  assigned_value numeric,
  value_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift record;
  v_existing record;
  v_any_existing_id uuid;
  v_create_context text;
  v_resolved_value numeric;
  v_resolved_source text;
  v_resolved_meta jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF _tenant_id IS NULL OR _shift_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id, shift_id e user_id são obrigatórios';
  END IF;

  IF _performed_by IS NULL OR _performed_by <> auth.uid() THEN
    RAISE EXCEPTION 'performed_by deve ser o usuário autenticado';
  END IF;

  IF _manual_value IS NOT NULL AND _manual_value < 0 THEN
    RAISE EXCEPTION 'manual_value não pode ser negativo';
  END IF;

  IF _status IS NULL OR _status NOT IN ('assigned', 'confirmed', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Status de assignment inválido';
  END IF;

  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Usuário autenticado não pertence ao tenant informado';
  END IF;

  v_create_context := current_setting('app.assignment_create_context', true);

  IF NOT public.is_tenant_admin(auth.uid(), _tenant_id)
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.has_gabs_bypass(auth.uid())
     AND v_create_context IS DISTINCT FROM 'self_claim' THEN
    RAISE EXCEPTION 'Sem permissão para criar atribuição diretamente';
  END IF;

  IF v_create_context = 'self_claim' AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Contexto self_claim só pode criar atribuição para o próprio usuário';
  END IF;

  SELECT
    s.id,
    s.tenant_id,
    s.sector_id
  INTO v_shift
  FROM public.shifts s
  WHERE s.id = _shift_id
    AND s.tenant_id = _tenant_id
  LIMIT 1
  FOR UPDATE;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'Plantão não encontrado para o tenant informado';
  END IF;

  SELECT sa.id, sa.assigned_value, sa.value_source
  INTO v_existing
  FROM public.shift_assignments sa
  WHERE sa.tenant_id = _tenant_id
    AND sa.shift_id = _shift_id
    AND sa.user_id = _user_id
    AND sa.status IN ('assigned', 'confirmed', 'completed')
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    assignment_id := v_existing.id;
    assigned_value := v_existing.assigned_value;
    value_source := v_existing.value_source;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT sa.id
  INTO v_any_existing_id
  FROM public.shift_assignments sa
  WHERE sa.tenant_id = _tenant_id
    AND sa.shift_id = _shift_id
    AND sa.status IN ('assigned', 'confirmed', 'completed')
  LIMIT 1;

  IF v_any_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este plantão já possui uma atribuição ativa';
  END IF;

  SELECT sa.id
  INTO v_any_existing_id
  FROM public.shift_assignments sa
  WHERE sa.tenant_id = _tenant_id
    AND sa.shift_id = _shift_id
    AND sa.user_id = _user_id
  LIMIT 1;

  IF v_any_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe histórico de atribuição para este usuário neste plantão';
  END IF;

  SELECT
    r.assigned_value,
    r.value_source,
    r.value_snapshot_meta
  INTO
    v_resolved_value,
    v_resolved_source,
    v_resolved_meta
  FROM public.resolve_assignment_snapshot_value(
    _tenant_id,
    _shift_id,
    _user_id,
    _manual_value,
    _performed_by
  ) r
  LIMIT 1;

  IF v_resolved_value IS NULL OR v_resolved_source IS NULL OR v_resolved_meta IS NULL THEN
    RAISE EXCEPTION 'Não foi possível resolver o snapshot financeiro da atribuição';
  END IF;

  PERFORM set_config('app.shift_assignment_snapshot_write', 'on', true);

  INSERT INTO public.shift_assignments (
    tenant_id,
    shift_id,
    user_id,
    assigned_value,
    value_source,
    value_snapshot_meta,
    status,
    created_at,
    updated_at,
    updated_by
  )
  VALUES (
    _tenant_id,
    _shift_id,
    _user_id,
    v_resolved_value,
    v_resolved_source,
    v_resolved_meta,
    _status,
    now(),
    now(),
    _performed_by
  )
  RETURNING id, public.shift_assignments.assigned_value, public.shift_assignments.value_source
  INTO assignment_id, assigned_value, value_source;

  RETURN NEXT;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.create_assignment_with_snapshot(uuid, uuid, uuid, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_assignment_with_snapshot(uuid, uuid, uuid, numeric, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_assignment_with_snapshot(uuid, uuid, uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_assignment_with_snapshot(uuid, uuid, uuid, numeric, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.override_assignment_value(
  _assignment_id uuid,
  _new_value numeric,
  _performed_by uuid DEFAULT auth.uid(),
  _reason text DEFAULT NULL
)
RETURNS TABLE(
  assignment_id uuid,
  assigned_value numeric,
  value_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_existing_meta jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF _performed_by IS NULL OR _performed_by <> auth.uid() THEN
    RAISE EXCEPTION 'performed_by deve ser o usuário autenticado';
  END IF;

  IF _new_value IS NOT NULL AND _new_value < 0 THEN
    RAISE EXCEPTION 'new_value não pode ser negativo';
  END IF;

  SELECT tenant_id, COALESCE(value_snapshot_meta, '{}'::jsonb)
    INTO v_tenant_id, v_existing_meta
  FROM public.shift_assignments
  WHERE id = _assignment_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Atribuição não encontrada';
  END IF;

  IF NOT public.is_tenant_admin(auth.uid(), v_tenant_id)
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.has_gabs_bypass(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para sobrescrever valor da atribuição';
  END IF;

  PERFORM set_config('app.shift_assignment_snapshot_write', 'on', true);

  UPDATE public.shift_assignments
  SET assigned_value = _new_value,
      value_source = CASE WHEN _new_value IS NULL THEN NULL ELSE 'manual' END,
      value_snapshot_meta = v_existing_meta || jsonb_build_object(
        'source', CASE WHEN _new_value IS NULL THEN NULL ELSE 'manual' END,
        'manual_override', jsonb_build_object(
          'new_value', _new_value,
          'reason', NULLIF(trim(COALESCE(_reason, '')), ''),
          'performed_by', _performed_by,
          'performed_at', now()
        )
      ),
      updated_at = now(),
      updated_by = _performed_by
  WHERE id = _assignment_id
  RETURNING id, public.shift_assignments.assigned_value, public.shift_assignments.value_source
  INTO assignment_id, assigned_value, value_source;

  RETURN NEXT;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.override_assignment_value(uuid, numeric, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.override_assignment_value(uuid, numeric, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.override_assignment_value(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.override_assignment_value(uuid, numeric, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.transfer_assignment_preserving_value(
  _source_assignment_id uuid,
  _target_shift_id uuid,
  _target_user_id uuid,
  _performed_by uuid DEFAULT auth.uid()
)
RETURNS TABLE(
  inserted_id uuid,
  assigned_value numeric,
  value_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_source record;
  v_target_shift record;
  v_profile_type text;
  v_membership_role text;
  v_transfer_context text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF _source_assignment_id IS NULL OR _target_shift_id IS NULL OR _target_user_id IS NULL THEN
    RAISE EXCEPTION 'source_assignment_id, target_shift_id e target_user_id são obrigatórios';
  END IF;

  IF _performed_by IS NULL OR _performed_by <> auth.uid() THEN
    RAISE EXCEPTION 'performed_by deve ser o usuário autenticado';
  END IF;

  SELECT *
  INTO v_source
  FROM public.shift_assignments
  WHERE id = _source_assignment_id
  LIMIT 1
  FOR UPDATE;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Atribuição de origem não encontrada';
  END IF;

  IF NOT public.is_tenant_member(auth.uid(), v_source.tenant_id) THEN
    RAISE EXCEPTION 'Usuário autenticado não pertence ao tenant informado';
  END IF;

  v_transfer_context := current_setting('app.assignment_transfer_context', true);

  IF NOT public.is_tenant_admin(auth.uid(), v_source.tenant_id)
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.has_gabs_bypass(auth.uid())
     AND v_transfer_context IS DISTINCT FROM 'swap_decision' THEN
    RAISE EXCEPTION 'Sem permissão para transferir esta atribuição';
  END IF;

  SELECT id, tenant_id, sector_id
  INTO v_target_shift
  FROM public.shifts
  WHERE id = _target_shift_id
    AND tenant_id = v_source.tenant_id
  LIMIT 1
  FOR UPDATE;

  IF v_target_shift.id IS NULL THEN
    RAISE EXCEPTION 'Plantão de destino não encontrado no mesmo tenant';
  END IF;

  SELECT m.role
  INTO v_membership_role
  FROM public.memberships m
  WHERE m.tenant_id = v_source.tenant_id
    AND m.user_id = _target_user_id
    AND m.active = true
  LIMIT 1;

  IF v_membership_role IS NULL THEN
    RAISE EXCEPTION 'Usuário destino não pertence ativamente ao tenant';
  END IF;

  IF v_membership_role IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Usuário destino não pode receber atribuições de escala';
  END IF;

  SELECT p.profile_type
  INTO v_profile_type
  FROM public.profiles p
  WHERE p.id = _target_user_id
  LIMIT 1;

  IF COALESCE(NULLIF(trim(v_profile_type), ''), 'plantonista') <> 'plantonista' THEN
    RAISE EXCEPTION 'Usuário destino não é um plantonista elegível';
  END IF;

  IF v_target_shift.sector_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sector_memberships sm
    WHERE sm.tenant_id = v_source.tenant_id
      AND sm.sector_id = v_target_shift.sector_id
      AND sm.user_id = _target_user_id
  ) THEN
    RAISE EXCEPTION 'Usuário destino não pertence ao setor do plantão de destino';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.tenant_id = v_source.tenant_id
      AND sa.shift_id = _target_shift_id
      AND sa.user_id = _target_user_id
      AND sa.id <> _source_assignment_id
      AND sa.status IN ('assigned', 'confirmed', 'completed')
  ) THEN
    RAISE EXCEPTION 'Já existe uma atribuição ativa para este usuário no plantão de destino';
  END IF;

  PERFORM set_config('app.shift_assignment_snapshot_write', 'on', true);

  INSERT INTO public.shift_assignments (
    tenant_id,
    shift_id,
    user_id,
    assigned_value,
    value_source,
    value_snapshot_meta,
    status,
    created_at,
    updated_at,
    updated_by
  )
  VALUES (
    v_source.tenant_id,
    _target_shift_id,
    _target_user_id,
    v_source.assigned_value,
    v_source.value_source,
    COALESCE(v_source.value_snapshot_meta, '{}'::jsonb) || jsonb_build_object(
      'transfer', jsonb_build_object(
        'source_assignment_id', v_source.id,
        'source_shift_id', v_source.shift_id,
        'performed_by', _performed_by,
        'performed_at', now()
      )
    ),
    v_source.status,
    now(),
    now(),
    _performed_by
  )
  RETURNING id, public.shift_assignments.assigned_value, public.shift_assignments.value_source
  INTO inserted_id, assigned_value, value_source;

  DELETE FROM public.shift_assignments
  WHERE id = _source_assignment_id;

  RETURN NEXT;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_assignment_preserving_value(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_assignment_preserving_value(uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_assignment_preserving_value(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_assignment_preserving_value(uuid, uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_shift_offer_with_snapshot(
  _offer_id uuid,
  _reviewer_id uuid DEFAULT auth.uid()
)
RETURNS TABLE(
  assignment_id uuid,
  assigned_value numeric,
  value_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_offer record;
  v_existing record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF _reviewer_id IS NULL OR _reviewer_id <> auth.uid() THEN
    RAISE EXCEPTION 'reviewer_id deve ser o usuário autenticado';
  END IF;

  SELECT so.*
  INTO v_offer
  FROM public.shift_offers so
  WHERE so.id = _offer_id
  LIMIT 1
  FOR UPDATE;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Oferta não encontrada';
  END IF;

  IF NOT public.is_tenant_admin(auth.uid(), v_offer.tenant_id)
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.has_gabs_bypass(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para aceitar oferta';
  END IF;

  IF v_offer.status <> 'pending' THEN
    RAISE EXCEPTION 'Oferta não está pendente';
  END IF;

  SELECT sa.id, sa.user_id, sa.assigned_value, sa.value_source
  INTO v_existing
  FROM public.shift_assignments sa
  WHERE sa.shift_id = v_offer.shift_id
    AND sa.status IN ('assigned', 'confirmed', 'completed')
  LIMIT 1;

  IF v_existing.id IS NOT NULL AND v_existing.user_id <> v_offer.user_id THEN
    RAISE EXCEPTION 'Este plantão já foi preenchido por outro plantonista';
  END IF;

  IF v_existing.id IS NULL THEN
    SELECT c.assignment_id, c.assigned_value, c.value_source
    INTO assignment_id, assigned_value, value_source
    FROM public.create_assignment_with_snapshot(
      v_offer.tenant_id,
      v_offer.shift_id,
      v_offer.user_id,
      NULL,
      'assigned',
      _reviewer_id
    ) c
    LIMIT 1;
  ELSE
    assignment_id := v_existing.id;
    assigned_value := v_existing.assigned_value;
    value_source := v_existing.value_source;
  END IF;

  UPDATE public.shift_offers
  SET status = 'accepted',
      reviewed_at = now(),
      reviewed_by = _reviewer_id,
      updated_at = now()
  WHERE id = _offer_id;

  UPDATE public.shift_offers
  SET status = 'rejected',
      reviewed_at = now(),
      reviewed_by = _reviewer_id,
      updated_at = now()
  WHERE shift_id = v_offer.shift_id
    AND status = 'pending'
    AND id <> _offer_id;

  RETURN NEXT;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_shift_offer_with_snapshot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_shift_offer_with_snapshot(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_shift_offer_with_snapshot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_shift_offer_with_snapshot(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_open_shift(_shift_id uuid, _message text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift record;
  v_assignment_id uuid;
  v_new_start_minutes integer;
  v_new_end_minutes integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, tenant_id, sector_id, shift_date, start_time, end_time
  INTO v_shift
  FROM public.shifts
  WHERE id = _shift_id
  LIMIT 1;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'Plantão não encontrado';
  END IF;

  IF NOT public.is_tenant_member(auth.uid(), v_shift.tenant_id) THEN
    RAISE EXCEPTION 'Usuário não pertence ao tenant';
  END IF;

  IF v_shift.sector_id IS NULL THEN
    RAISE EXCEPTION 'Plantão sem setor definido';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sector_memberships sm
    JOIN public.memberships m
      ON m.tenant_id = sm.tenant_id
     AND m.user_id = sm.user_id
     AND m.active = true
    JOIN public.profiles p
      ON p.id = sm.user_id
    WHERE sm.tenant_id = v_shift.tenant_id
      AND sm.sector_id = v_shift.sector_id
      AND sm.user_id = auth.uid()
      AND COALESCE(NULLIF(trim(p.profile_type), ''), 'plantonista') = 'plantonista'
  ) THEN
    RAISE EXCEPTION 'Somente membros do setor podem aceitar este plantão';
  END IF;

  IF v_shift.shift_date < current_date THEN
    RAISE EXCEPTION 'Não é possível aceitar plantão em data passada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.tenant_id = v_shift.tenant_id
      AND sa.shift_id = _shift_id
      AND sa.status IN ('assigned', 'confirmed', 'completed')
  ) THEN
    RAISE EXCEPTION 'Plantão já foi preenchido';
  END IF;

  v_new_start_minutes :=
    split_part(v_shift.start_time::text, ':', 1)::int * 60
    + split_part(v_shift.start_time::text, ':', 2)::int;
  v_new_end_minutes :=
    split_part(v_shift.end_time::text, ':', 1)::int * 60
    + split_part(v_shift.end_time::text, ':', 2)::int;

  IF v_new_end_minutes <= v_new_start_minutes THEN
    v_new_end_minutes := v_new_end_minutes + 1440;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    JOIN public.shifts s2
      ON s2.id = sa.shift_id
     AND s2.tenant_id = sa.tenant_id
    WHERE sa.tenant_id = v_shift.tenant_id
      AND sa.user_id = auth.uid()
      AND sa.status IN ('assigned', 'confirmed', 'completed')
      AND s2.shift_date = v_shift.shift_date
      AND (
        (split_part(s2.start_time::text, ':', 1)::int * 60 + split_part(s2.start_time::text, ':', 2)::int) < v_new_end_minutes
      )
      AND (
        v_new_start_minutes <
        CASE
          WHEN (split_part(s2.end_time::text, ':', 1)::int * 60 + split_part(s2.end_time::text, ':', 2)::int)
             <= (split_part(s2.start_time::text, ':', 1)::int * 60 + split_part(s2.start_time::text, ':', 2)::int)
          THEN (split_part(s2.end_time::text, ':', 1)::int * 60 + split_part(s2.end_time::text, ':', 2)::int) + 1440
          ELSE (split_part(s2.end_time::text, ':', 1)::int * 60 + split_part(s2.end_time::text, ':', 2)::int)
        END
      )
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: você já possui outro plantão neste dia e horário. Abra Trocas para ajustar antes de se candidatar.';
  END IF;

  PERFORM set_config('app.assignment_create_context', 'self_claim', true);

  SELECT c.assignment_id
  INTO v_assignment_id
  FROM public.create_assignment_with_snapshot(
    v_shift.tenant_id,
    _shift_id,
    auth.uid(),
    NULL,
    'assigned',
    auth.uid()
  ) c
  LIMIT 1;

  INSERT INTO public.shift_offers (
    shift_id,
    user_id,
    tenant_id,
    message,
    status,
    reviewed_at,
    reviewed_by,
    created_by
  )
  VALUES (
    _shift_id,
    auth.uid(),
    v_shift.tenant_id,
    NULLIF(trim(COALESCE(_message, '')), ''),
    'accepted',
    now(),
    auth.uid(),
    auth.uid()
  )
  ON CONFLICT (shift_id, user_id)
  DO UPDATE SET
    status = 'accepted',
    message = EXCLUDED.message,
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    updated_at = now();

  RETURN v_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_open_shift(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_open_shift(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_open_shift(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_open_shift(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.decide_swap_request(_swap_request_id uuid, _decision text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_requester_id uuid;
  v_target_user_id uuid;
  v_origin_assignment_id uuid;
  v_origin_shift_id uuid;
  v_current_status public.swap_status;
  v_assignment_user_id uuid;
  v_shift_date date;
  v_shift_sector_id uuid;
  v_shift_start_minutes integer;
  v_shift_end_minutes integer;
  v_conflict_title text;
  v_conflict_hospital text;
  v_conflict_start text;
  v_conflict_end text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT tenant_id, requester_id, target_user_id, origin_assignment_id, status
    INTO v_tenant_id, v_requester_id, v_target_user_id, v_origin_assignment_id, v_current_status
  FROM public.swap_requests
  WHERE id = _swap_request_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Swap request not found';
  END IF;

  IF NOT (auth.uid() = v_target_user_id OR public.is_tenant_admin(auth.uid(), v_tenant_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'Swap request is not pending';
  END IF;

  SELECT
    sa.user_id,
    sa.shift_id,
    s.shift_date,
    s.sector_id,
    (split_part(s.start_time::text, ':', 1)::int * 60 + split_part(s.start_time::text, ':', 2)::int),
    (split_part(s.end_time::text, ':', 1)::int * 60 + split_part(s.end_time::text, ':', 2)::int)
  INTO
    v_assignment_user_id,
    v_origin_shift_id,
    v_shift_date,
    v_shift_sector_id,
    v_shift_start_minutes,
    v_shift_end_minutes
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  WHERE sa.id = v_origin_assignment_id
    AND sa.tenant_id = v_tenant_id
  LIMIT 1;

  IF v_assignment_user_id IS NULL THEN
    RAISE EXCEPTION 'Origin assignment not found';
  END IF;

  IF v_assignment_user_id <> v_requester_id THEN
    RAISE EXCEPTION 'Origin assignment is not owned by requester';
  END IF;

  IF NOT public.is_tenant_member(v_requester_id, v_tenant_id) OR NOT public.is_tenant_member(v_target_user_id, v_tenant_id) THEN
    RAISE EXCEPTION 'Requester/target not in tenant';
  END IF;

  IF v_shift_sector_id IS NULL THEN
    RAISE EXCEPTION 'Swap requires a sector on shift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sector_memberships sm
    JOIN public.memberships m
      ON m.tenant_id = sm.tenant_id
     AND m.user_id = sm.user_id
     AND m.active = true
     AND m.role <> 'admin'
     AND m.role <> 'owner'
    JOIN public.profiles p
      ON p.id = sm.user_id
    WHERE sm.tenant_id = v_tenant_id
      AND sm.sector_id = v_shift_sector_id
      AND sm.user_id = v_requester_id
      AND COALESCE(NULLIF(trim(p.profile_type), ''), 'plantonista') = 'plantonista'
  ) THEN
    RAISE EXCEPTION 'Solicitante não está apto para plantões neste setor';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sector_memberships sm
    JOIN public.memberships m
      ON m.tenant_id = sm.tenant_id
     AND m.user_id = sm.user_id
     AND m.active = true
     AND m.role <> 'admin'
     AND m.role <> 'owner'
    JOIN public.profiles p
      ON p.id = sm.user_id
    WHERE sm.tenant_id = v_tenant_id
      AND sm.sector_id = v_shift_sector_id
      AND sm.user_id = v_target_user_id
      AND COALESCE(NULLIF(trim(p.profile_type), ''), 'plantonista') = 'plantonista'
  ) THEN
    RAISE EXCEPTION 'O colega escolhido não é um plantonista ativo do mesmo setor';
  END IF;

  IF _decision = 'approved' THEN
    IF v_shift_date < current_date THEN
      RAISE EXCEPTION 'Não é possível concluir troca de plantão em data passada';
    END IF;

    IF v_shift_end_minutes <= v_shift_start_minutes THEN
      v_shift_end_minutes := v_shift_end_minutes + 1440;
    END IF;

    SELECT
      s2.title,
      s2.hospital,
      s2.start_time::text,
      s2.end_time::text
    INTO
      v_conflict_title,
      v_conflict_hospital,
      v_conflict_start,
      v_conflict_end
    FROM public.shift_assignments sa
    JOIN public.shifts s2
      ON s2.id = sa.shift_id
     AND s2.tenant_id = sa.tenant_id
    WHERE sa.tenant_id = v_tenant_id
      AND sa.user_id = v_target_user_id
      AND sa.id <> v_origin_assignment_id
      AND sa.status IN ('assigned', 'confirmed', 'completed')
      AND s2.shift_date = v_shift_date
      AND (split_part(s2.start_time::text, ':', 1)::int * 60 + split_part(s2.start_time::text, ':', 2)::int) < v_shift_end_minutes
      AND v_shift_start_minutes <
        CASE
          WHEN (split_part(s2.end_time::text, ':', 1)::int * 60 + split_part(s2.end_time::text, ':', 2)::int)
             <= (split_part(s2.start_time::text, ':', 1)::int * 60 + split_part(s2.start_time::text, ':', 2)::int)
          THEN (split_part(s2.end_time::text, ':', 1)::int * 60 + split_part(s2.end_time::text, ':', 2)::int) + 1440
          ELSE (split_part(s2.end_time::text, ':', 1)::int * 60 + split_part(s2.end_time::text, ':', 2)::int)
        END
    LIMIT 1;

    IF v_conflict_title IS NOT NULL THEN
      RAISE EXCEPTION 'Conflito ao aceitar troca: o colega já está escalado em "%" (% - %, %). Resolva primeiro em Trocas.', v_conflict_title, COALESCE(v_conflict_start, '--:--'), COALESCE(v_conflict_end, '--:--'), COALESCE(v_conflict_hospital, 'hospital não informado');
    END IF;
  END IF;

  UPDATE public.swap_requests
  SET status = _decision::public.swap_status,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE id = _swap_request_id;

  IF _decision = 'approved' THEN
    PERFORM set_config('app.assignment_transfer_context', 'swap_decision', true);

    PERFORM public.transfer_assignment_preserving_value(
      v_origin_assignment_id,
      v_origin_shift_id,
      v_target_user_id,
      auth.uid()
    );

    UPDATE public.swap_requests
    SET status = 'cancelled'::public.swap_status,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        updated_at = now()
    WHERE tenant_id = v_tenant_id
      AND origin_assignment_id = v_origin_assignment_id
      AND id <> _swap_request_id
      AND status = 'pending';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_swap_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_swap_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.decide_swap_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_swap_request(uuid, text) TO service_role;

COMMIT;
