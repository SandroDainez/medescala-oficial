-- Fix shift_assignments visibility when tenant_id is NULL by deriving tenant from the related shift.

CREATE OR REPLACE FUNCTION public.get_shift_tenant_id(_shift_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.shifts
  WHERE id = _shift_id
  LIMIT 1
$$;

DROP POLICY IF EXISTS "Tenant members can view all assignments in tenant" ON public.shift_assignments;

CREATE POLICY "Tenant members can view all assignments in tenant"
ON public.shift_assignments
FOR SELECT
USING (
  is_tenant_member(
    auth.uid(),
    COALESCE(tenant_id, public.get_shift_tenant_id(shift_id))
  )
);

-- Keep existing UPDATE/ALL policies as-is.