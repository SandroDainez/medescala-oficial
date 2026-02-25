-- Fix claim_open_shift: shift_assignments does not have created_by column.
-- Keep updated_by audit and accepted offer history as-is.

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tenant_id, sector_id, shift_date, base_value
    INTO v_tenant_id, v_sector_id, v_shift_date, v_base_value
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

