-- Provide a safe roster function that exposes only names + basic assignment status for a tenant and date range
-- This avoids relaxing RLS on shift_assignments / profiles.

CREATE OR REPLACE FUNCTION public.get_shift_roster(
  _tenant_id uuid,
  _start date,
  _end date
)
RETURNS TABLE(
  shift_id uuid,
  user_id uuid,
  status text,
  name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sa.shift_id,
    sa.user_id,
    sa.status,
    p.name
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  JOIN public.profiles p ON p.id = sa.user_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND s.shift_date <= _end
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;