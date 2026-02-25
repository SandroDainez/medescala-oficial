-- Secure deletion for schedule movement history:
-- requires tenant admin/super admin + reopen password.

CREATE OR REPLACE FUNCTION public.delete_schedule_movements_with_password(
  _tenant_id uuid,
  _movement_ids uuid[],
  _password text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _deleted_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), _tenant_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir movimentações';
  END IF;

  IF NOT public.verify_schedule_reopen_password(_password) THEN
    RAISE EXCEPTION 'Senha de reabertura inválida';
  END IF;

  IF _movement_ids IS NULL OR array_length(_movement_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.schedule_movements sm
  WHERE sm.tenant_id = _tenant_id
    AND sm.id = ANY(_movement_ids);

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  RETURN _deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_schedule_movements_with_password(uuid, uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_schedule_movements_with_password(uuid, uuid[], text) TO authenticated;
