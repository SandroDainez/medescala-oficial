-- Avoid huge `IN (..ids..)` queries that hit URL limits (400) by fetching assignments/offers by date range.

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
    p.name
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  JOIN public.profiles p ON p.id = sa.user_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND s.shift_date <= _end
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;

CREATE OR REPLACE FUNCTION public.get_shift_offers_pending_range(
  _tenant_id uuid,
  _start date,
  _end date
)
RETURNS TABLE(
  id uuid,
  shift_id uuid,
  user_id uuid,
  status text,
  message text,
  name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    so.id,
    so.shift_id,
    so.user_id,
    so.status,
    so.message,
    p.name
  FROM public.shift_offers so
  JOIN public.shifts s ON s.id = so.shift_id
  JOIN public.profiles p ON p.id = so.user_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND s.shift_date <= _end
    AND so.status = 'pending'
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;
