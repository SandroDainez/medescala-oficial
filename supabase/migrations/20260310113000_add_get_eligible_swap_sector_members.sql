BEGIN;

CREATE OR REPLACE FUNCTION public.get_eligible_swap_sector_members(_tenant_id uuid, _sector_id uuid)
RETURNS TABLE(user_id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.name), ''), 'Sem nome') AS name
  FROM public.sector_memberships sm
  JOIN public.memberships m
    ON m.tenant_id = sm.tenant_id
   AND m.user_id = sm.user_id
   AND m.active = true
  JOIN public.profiles p
    ON p.id = sm.user_id
  WHERE sm.tenant_id = _tenant_id
    AND sm.sector_id = _sector_id
    AND sm.user_id <> auth.uid()
    AND COALESCE(NULLIF(trim(p.profile_type), ''), 'plantonista') = 'plantonista'
  ORDER BY COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.name), ''), 'Sem nome');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_swap_sector_members(uuid, uuid) TO authenticated;

COMMIT;
