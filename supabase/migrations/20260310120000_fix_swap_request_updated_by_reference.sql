BEGIN;

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
    s.shift_date,
    s.sector_id,
    (split_part(s.start_time::text, ':', 1)::int * 60 + split_part(s.start_time::text, ':', 2)::int),
    (split_part(s.end_time::text, ':', 1)::int * 60 + split_part(s.end_time::text, ':', 2)::int)
  INTO
    v_assignment_user_id,
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
      AND p.profile_type = 'plantonista'
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
      AND p.profile_type = 'plantonista'
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
    PERFORM set_config('app.bypass_restrict_user_assignment_update', 'true', true);

    UPDATE public.shift_assignments
    SET user_id = v_target_user_id,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = v_origin_assignment_id;

    PERFORM set_config('app.bypass_restrict_user_assignment_update', 'false', true);
  END IF;

  RETURN true;
END;
$$;

COMMIT;
