-- Ensure financial/schedule roster RPCs return only plantonistas.
-- This prevents admin users from appearing as assignees in reports and calendars.

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
  JOIN public.profiles p
    ON p.id = sa.user_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND s.shift_date <= _end
    AND COALESCE(p.profile_type, 'plantonista') = 'plantonista'
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;

