
-- Corrigir a função get_tenant_member_names para verificar permissão corretamente
CREATE OR REPLACE FUNCTION public.get_tenant_member_names(_tenant_id uuid)
 RETURNS TABLE(user_id uuid, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se o usuário tem permissão primeiro
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RETURN;
  END IF;

  -- Retornar os membros do tenant
  RETURN QUERY
  SELECT p.id AS user_id, p.name
  FROM public.memberships m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.tenant_id = _tenant_id
    AND m.active = true
  ORDER BY p.name NULLS LAST;
END;
$$;
