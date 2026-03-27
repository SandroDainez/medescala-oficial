BEGIN;

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

  IF v_source.shift_id = _target_shift_id THEN
    UPDATE public.shift_assignments
    SET user_id = _target_user_id,
        value_snapshot_meta = COALESCE(v_source.value_snapshot_meta, '{}'::jsonb) || jsonb_build_object(
          'transfer', jsonb_build_object(
            'source_assignment_id', v_source.id,
            'source_shift_id', v_source.shift_id,
            'performed_by', _performed_by,
            'performed_at', now()
          )
        ),
        updated_at = now(),
        updated_by = _performed_by
    WHERE id = _source_assignment_id
    RETURNING id, public.shift_assignments.assigned_value, public.shift_assignments.value_source
    INTO inserted_id, assigned_value, value_source;

    RETURN NEXT;
    RETURN;
  END IF;

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

COMMIT;
