-- Reopen password validation hardening + backward compatibility.
-- Fixes cases where tenant-scoped password is not yet set or has spacing differences.

-- Ensure every tenant has a row in tenant_security_settings.
INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password)
SELECT t.id, NULL
FROM public.tenants t
LEFT JOIN public.tenant_security_settings s ON s.tenant_id = t.id
WHERE s.tenant_id IS NULL;

-- Backfill missing tenant password with requested default for existing tenants.
UPDATE public.tenant_security_settings
SET schedule_reopen_password = 'reabrir2026sandro',
    updated_at = now()
WHERE schedule_reopen_password IS NULL
   OR length(trim(schedule_reopen_password)) = 0;

-- Verify reopen password for tenant with legacy fallback.
CREATE OR REPLACE FUNCTION public.verify_schedule_reopen_password(_tenant_id uuid, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_tenant_admin(auth.uid(), _tenant_id)
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.tenant_security_settings s
        WHERE s.tenant_id = _tenant_id
          AND s.schedule_reopen_password IS NOT NULL
          AND trim(s.schedule_reopen_password) = trim(COALESCE(_password, ''))
      )
      OR EXISTS (
        SELECT 1
        FROM public.system_settings ss
        WHERE ss.setting_key = 'schedule_reopen_password'
          AND ss.setting_value IS NOT NULL
          AND trim(ss.setting_value) = trim(COALESCE(_password, ''))
      )
    );
$$;

-- Save password with trim normalization.
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
  _new_clean text := trim(COALESCE(_new_password, ''));
  _current_clean text := trim(COALESCE(_current_password, ''));
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

  IF _new_clean IS NULL OR length(_new_clean) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter pelo menos 6 caracteres';
  END IF;

  SELECT s.schedule_reopen_password
  INTO _existing
  FROM public.tenant_security_settings s
  WHERE s.tenant_id = _tenant_id;

  IF _existing IS NOT NULL AND trim(_existing) <> '' THEN
    IF _current_clean = '' OR _current_clean <> trim(_existing) THEN
      RAISE EXCEPTION 'Senha atual incorreta';
    END IF;
  END IF;

  INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password, updated_by)
  VALUES (_tenant_id, _new_clean, auth.uid())
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    schedule_reopen_password = EXCLUDED.schedule_reopen_password,
    updated_at = now(),
    updated_by = auth.uid();

  RETURN true;
END;
$$;

