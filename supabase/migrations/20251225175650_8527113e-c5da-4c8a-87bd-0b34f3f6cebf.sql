-- Restrict colleague profile access: remove broad profiles SELECT policy and provide a safe RPC that returns only member names.

-- 1) Remove overly-permissive policy (it exposed all profile columns to tenant members)
DROP POLICY IF EXISTS "Tenant members can view colleague profiles" ON public.profiles;

-- 2) Safe RPC: returns ONLY id + name for members of a tenant
CREATE OR REPLACE FUNCTION public.get_tenant_member_names(_tenant_id uuid)
RETURNS TABLE(user_id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id AS user_id, p.name
  FROM public.memberships m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.tenant_id = _tenant_id
    AND m.active = true
    AND public.is_tenant_member(auth.uid(), _tenant_id)
  ORDER BY p.name NULLS LAST
$$;