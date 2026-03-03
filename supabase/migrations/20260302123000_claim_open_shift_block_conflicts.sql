-- Bloqueia candidatura/aceite em plantão disponível quando o usuário já possui
-- outro plantão no mesmo dia com sobreposição de horário.

CREATE OR REPLACE FUNCTION public.claim_open_shift(_shift_id uuid, _message text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_sector_id uuid;
  v_shift_date date;
  v_base_value numeric(10,2);
  v_assignment_id uuid;
  v_new_start_minutes integer;
  v_new_end_minutes integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tenant_id, sector_id, shift_date, base_value,
         (split_part(start_time::text, ':', 1)::int * 60 + split_part(start_time::text, ':', 2)::int),
         (split_part(end_time::text, ':', 1)::int * 60 + split_part(end_time::text, ':', 2)::int)
    INTO v_tenant_id, v_sector_id, v_shift_date, v_base_value, v_new_start_minutes, v_new_end_minutes
  FROM public.shifts
  WHERE id = _shift_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Plantão não encontrado';
  END IF;

  IF NOT public.is_tenant_member(auth.uid(), v_tenant_id) THEN
    RAISE EXCEPTION 'Usuário não pertence ao tenant';
  END IF;

  IF v_sector_id IS NULL THEN
    RAISE EXCEPTION 'Plantão sem setor definido';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sector_memberships sm
    WHERE sm.tenant_id = v_tenant_id
      AND sm.sector_id = v_sector_id
      AND sm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Somente membros do setor podem aceitar este plantão';
  END IF;

  IF v_shift_date < current_date THEN
    RAISE EXCEPTION 'Não é possível aceitar plantão em data passada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.tenant_id = v_tenant_id
      AND sa.shift_id = _shift_id
      AND sa.status IN ('assigned', 'confirmed', 'completed')
  ) THEN
    RAISE EXCEPTION 'Plantão já foi preenchido';
  END IF;

  IF v_new_end_minutes <= v_new_start_minutes THEN
    v_new_end_minutes := v_new_end_minutes + 1440;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    JOIN public.shifts s2
      ON s2.id = sa.shift_id
     AND s2.tenant_id = sa.tenant_id
    WHERE sa.tenant_id = v_tenant_id
      AND sa.user_id = auth.uid()
      AND sa.status IN ('assigned', 'confirmed', 'completed')
      AND s2.shift_date = v_shift_date
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

  INSERT INTO public.shift_assignments (
    tenant_id,
    shift_id,
    user_id,
    assigned_value,
    status,
    updated_by
  )
  VALUES (
    v_tenant_id,
    _shift_id,
    auth.uid(),
    v_base_value,
    'assigned',
    auth.uid()
  )
  RETURNING id INTO v_assignment_id;

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
    v_tenant_id,
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

GRANT EXECUTE ON FUNCTION public.claim_open_shift(uuid, text) TO authenticated;

