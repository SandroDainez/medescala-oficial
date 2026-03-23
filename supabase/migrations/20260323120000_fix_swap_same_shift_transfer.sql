BEGIN;

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
