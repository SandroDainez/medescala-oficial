BEGIN;

-- Validate swap creation and approval by sector membership.
CREATE OR REPLACE FUNCTION public.validate_swap_request_by_sector()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift_sector_id uuid;
  v_assignment_user_id uuid;
BEGIN
  IF NEW.origin_assignment_id IS NULL OR NEW.requester_id IS NULL OR NEW.target_user_id IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios da troca ausentes';
  END IF;

  SELECT sa.user_id, s.sector_id
    INTO v_assignment_user_id, v_shift_sector_id
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  WHERE sa.id = NEW.origin_assignment_id
    AND sa.tenant_id = NEW.tenant_id
  LIMIT 1;

  IF v_assignment_user_id IS NULL THEN
    RAISE EXCEPTION 'Plantão de origem não encontrado';
  END IF;

  IF v_assignment_user_id <> NEW.requester_id THEN
    RAISE EXCEPTION 'A troca só pode ser criada pelo dono do plantão';
  END IF;

  IF v_shift_sector_id IS NULL THEN
    RAISE EXCEPTION 'Troca exige setor definido no plantão';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sector_memberships sm
    WHERE sm.tenant_id = NEW.tenant_id
      AND sm.sector_id = v_shift_sector_id
      AND sm.user_id = NEW.requester_id
  ) THEN
    RAISE EXCEPTION 'Solicitante não pertence ao setor do plantão';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sector_memberships sm
    WHERE sm.tenant_id = NEW.tenant_id
      AND sm.sector_id = v_shift_sector_id
      AND sm.user_id = NEW.target_user_id
  ) THEN
    RAISE EXCEPTION 'Destino da troca não pertence ao setor do plantão';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_swap_request_by_sector ON public.swap_requests;
CREATE TRIGGER trg_validate_swap_request_by_sector
BEFORE INSERT ON public.swap_requests
FOR EACH ROW
EXECUTE FUNCTION public.validate_swap_request_by_sector();

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

  SELECT sa.user_id, s.shift_date, s.sector_id
    INTO v_assignment_user_id, v_shift_date, v_shift_sector_id
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
    WHERE sm.tenant_id = v_tenant_id
      AND sm.sector_id = v_shift_sector_id
      AND sm.user_id = v_requester_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.sector_memberships sm
    WHERE sm.tenant_id = v_tenant_id
      AND sm.sector_id = v_shift_sector_id
      AND sm.user_id = v_target_user_id
  ) THEN
    RAISE EXCEPTION 'Swap allowed only between members of same sector';
  END IF;

  UPDATE public.swap_requests
  SET status = _decision::public.swap_status,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = _swap_request_id;

  IF _decision = 'approved' THEN
    IF v_shift_date < current_date THEN
      RAISE EXCEPTION 'Cannot swap past shifts';
    END IF;

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

GRANT EXECUTE ON FUNCTION public.decide_swap_request(uuid, text) TO authenticated;

-- Claim an available shift directly (sector member only), assigning immediately and writing offer history.
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
    created_by,
    updated_by
  )
  VALUES (
    v_tenant_id,
    _shift_id,
    auth.uid(),
    v_base_value,
    'assigned',
    auth.uid(),
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
    message = EXCLUDED.message,
    status = 'accepted',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    updated_at = now();

  UPDATE public.shift_offers
  SET status = 'rejected',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE shift_id = _shift_id
    AND status = 'pending'
    AND user_id <> auth.uid();

  RETURN v_assignment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_open_shift(uuid, text) TO authenticated;

COMMIT;
