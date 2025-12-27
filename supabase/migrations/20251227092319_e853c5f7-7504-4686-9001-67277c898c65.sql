-- Allow safe user-side acceptance/rejection of swap requests via RPC

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

  -- Only the target user or a tenant admin can decide
  IF NOT (auth.uid() = v_target_user_id OR public.is_tenant_admin(auth.uid(), v_tenant_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Must be pending
  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'Swap request is not pending';
  END IF;

  -- Validate the assignment belongs to requester and tenant
  SELECT sa.user_id, s.shift_date
    INTO v_assignment_user_id, v_shift_date
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

  -- Persist decision
  UPDATE public.swap_requests
  SET status = _decision::public.swap_status,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = _swap_request_id;

  -- If approved, transfer assignment to target user
  IF _decision = 'approved' THEN
    -- Prevent swapping past shifts
    IF v_shift_date < current_date THEN
      RAISE EXCEPTION 'Cannot swap past shifts';
    END IF;

    UPDATE public.shift_assignments
    SET user_id = v_target_user_id,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = v_origin_assignment_id;
  END IF;

  RETURN true;
END;
$$;

-- Grant RPC execution to authenticated clients
GRANT EXECUTE ON FUNCTION public.decide_swap_request(uuid, text) TO authenticated;
