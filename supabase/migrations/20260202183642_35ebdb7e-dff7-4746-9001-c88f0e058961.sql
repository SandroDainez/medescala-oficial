-- Allow SECURITY DEFINER RPCs to update shift_assignments.user_id by using a session-scoped bypass flag.
-- This prevents the restrict_user_assignment_update trigger from reverting the user_id change
-- when a non-admin accepts a swap (the intended behavior).

BEGIN;

-- 1) Update trigger function with a safe, explicit bypass (session-local setting)
CREATE OR REPLACE FUNCTION public.restrict_user_assignment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bypass boolean := false;
BEGIN
  -- Bypass only when explicitly enabled in-session by a SECURITY DEFINER function.
  v_bypass := (current_setting('app.bypass_restrict_user_assignment_update', true) = 'true');

  -- If user is NOT admin and bypass not enabled, only allow checkin_at/checkout_at changes
  IF NOT v_bypass
     AND NOT public.is_tenant_admin(auth.uid(), OLD.tenant_id)
     AND NOT public.has_gabs_bypass(auth.uid()) THEN

    -- Force other fields to remain unchanged
    NEW.shift_id := OLD.shift_id;
    NEW.user_id := OLD.user_id;
    NEW.tenant_id := OLD.tenant_id;
    NEW.assigned_value := OLD.assigned_value;
    NEW.status := OLD.status;
    NEW.notes := OLD.notes;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    -- Only allow updating: checkin_at, checkout_at, updated_at, updated_by
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

-- 2) Ensure the trigger exists (older metadata may not list it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'restrict_user_assignment_update'
      AND n.nspname = 'public'
      AND c.relname = 'shift_assignments'
  ) THEN
    CREATE TRIGGER restrict_user_assignment_update
    BEFORE UPDATE ON public.shift_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.restrict_user_assignment_update();
  END IF;
END;
$$;

-- 3) Enable bypass inside decide_swap_request ONLY for the assignment transfer UPDATE
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

    -- Enable bypass only for this transaction scope
    PERFORM set_config('app.bypass_restrict_user_assignment_update', 'true', true);

    UPDATE public.shift_assignments
    SET user_id = v_target_user_id,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = v_origin_assignment_id;

    -- Disable bypass explicitly (defense-in-depth)
    PERFORM set_config('app.bypass_restrict_user_assignment_update', 'false', true);
  END IF;

  RETURN true;
END;
$$;

COMMIT;