-- Tenant-scoped reopen password management.
-- - First setup: tenant admin can set without current password.
-- - Password change: requires current password.
-- - Existing tenants receive requested initial password: reabrir2026sandro.

CREATE TABLE IF NOT EXISTS public.tenant_security_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  schedule_reopen_password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.tenant_security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_security_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can view tenant security settings" ON public.tenant_security_settings;
CREATE POLICY "Tenant admins can view tenant security settings"
ON public.tenant_security_settings
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins can manage tenant security settings" ON public.tenant_security_settings;
CREATE POLICY "Tenant admins can manage tenant security settings"
ON public.tenant_security_settings
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), tenant_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), tenant_id)
  )
);

-- Apply requested password for current existing tenants.
INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password)
SELECT t.id, 'reabrir2026sandro'
FROM public.tenants t
ON CONFLICT (tenant_id)
DO UPDATE SET
  schedule_reopen_password = EXCLUDED.schedule_reopen_password,
  updated_at = now();

-- Verify reopen password for a specific tenant.
CREATE OR REPLACE FUNCTION public.verify_schedule_reopen_password(_tenant_id uuid, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_security_settings s
    WHERE s.tenant_id = _tenant_id
      AND s.schedule_reopen_password IS NOT NULL
      AND s.schedule_reopen_password = _password
  )
  AND auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), _tenant_id)
  );
$$;

-- Returns true when tenant already has a configured reopen password.
CREATE OR REPLACE FUNCTION public.has_schedule_reopen_password(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_security_settings s
    WHERE s.tenant_id = _tenant_id
      AND s.schedule_reopen_password IS NOT NULL
      AND length(trim(s.schedule_reopen_password)) > 0
  )
  AND auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), _tenant_id)
  );
$$;

-- Set / change reopen password with rule:
-- first set does not require current password; changes require current password.
CREATE OR REPLACE FUNCTION public.set_schedule_reopen_password(
  _tenant_id uuid,
  _current_password text,
  _new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), _tenant_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a senha';
  END IF;

  IF _new_password IS NULL OR length(trim(_new_password)) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter pelo menos 6 caracteres';
  END IF;

  SELECT s.schedule_reopen_password
  INTO _existing
  FROM public.tenant_security_settings s
  WHERE s.tenant_id = _tenant_id;

  IF _existing IS NOT NULL AND _existing <> '' THEN
    IF _current_password IS NULL OR _current_password <> _existing THEN
      RAISE EXCEPTION 'Senha atual incorreta';
    END IF;
  END IF;

  INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password, updated_by)
  VALUES (_tenant_id, _new_password, auth.uid())
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    schedule_reopen_password = EXCLUDED.schedule_reopen_password,
    updated_at = now(),
    updated_by = auth.uid();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_schedule_reopen_password(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.has_schedule_reopen_password(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.set_schedule_reopen_password(uuid, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.verify_schedule_reopen_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_schedule_reopen_password(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_schedule_reopen_password(uuid, text, text) TO authenticated;

-- From this migration forward, movement deletion must validate tenant-scoped password.
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

  IF NOT public.verify_schedule_reopen_password(_tenant_id, _password) THEN
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
