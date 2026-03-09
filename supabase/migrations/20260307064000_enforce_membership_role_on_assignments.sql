-- Enforce assignment eligibility by active tenant membership + plantonista profile.
-- This prevents admin/owner users from appearing in escala/financeiro.

CREATE OR REPLACE FUNCTION public.get_shift_assignments_range(
  _tenant_id uuid,
  _start date,
  _end date
)
RETURNS TABLE(
  id uuid,
  shift_id uuid,
  user_id uuid,
  assigned_value numeric,
  status text,
  name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sa.id,
    sa.shift_id,
    sa.user_id,
    sa.assigned_value,
    sa.status,
    COALESCE(NULLIF(TRIM(p.full_name), ''), NULLIF(TRIM(p.name), ''), 'Sem nome') AS name
  FROM public.shift_assignments sa
  JOIN public.shifts s
    ON s.id = sa.shift_id
  JOIN public.memberships m
    ON m.user_id = sa.user_id
   AND m.tenant_id = _tenant_id
   AND m.active = true
   AND m.role <> 'admin'
   AND m.role <> 'owner'
  JOIN public.profiles p
    ON p.id = sa.user_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND s.shift_date <= _end
    AND p.profile_type = 'plantonista'
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;

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
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

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
