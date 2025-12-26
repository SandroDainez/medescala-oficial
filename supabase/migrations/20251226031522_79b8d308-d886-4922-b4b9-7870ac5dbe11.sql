-- Expose taken shift ids to tenant members without leaking roster details
-- This avoids relying on client-side reads of shift_assignments which are restricted by RLS.

CREATE OR REPLACE FUNCTION public.get_taken_shift_ids(_tenant_id uuid, _start date)
RETURNS TABLE(shift_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT sa.shift_id
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND public.is_tenant_member(auth.uid(), _tenant_id)
    AND sa.status IN ('assigned', 'confirmed', 'completed');
$$;

GRANT EXECUTE ON FUNCTION public.get_taken_shift_ids(uuid, date) TO authenticated;