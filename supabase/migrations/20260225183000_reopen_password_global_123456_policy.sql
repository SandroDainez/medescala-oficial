-- Policy update requested:
-- - Global reopen password for other hospitals/services: 123456
-- - Tenant-specific password must take precedence when configured.

-- Set legacy/global default password.
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'schedule_reopen_password',
  '123456',
  'Senha global padrão para reabertura (tenants sem senha própria)'
)
ON CONFLICT (setting_key)
DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = now();

-- Keep GABS tenant with explicit dedicated password, if present.
INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password)
SELECT t.id, 'reabrir2026sandro'
FROM public.tenants t
WHERE lower(t.slug) = 'gabs'
ON CONFLICT (tenant_id)
DO UPDATE SET
  schedule_reopen_password = EXCLUDED.schedule_reopen_password,
  updated_at = now();

-- Validate reopen password:
-- 1) If tenant has a specific password, ONLY that password is accepted.
-- 2) If tenant has no specific password, use global legacy password.
CREATE OR REPLACE FUNCTION public.verify_schedule_reopen_password(_tenant_id uuid, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH tenant_pwd AS (
    SELECT trim(COALESCE(s.schedule_reopen_password, '')) AS pwd
    FROM public.tenant_security_settings s
    WHERE s.tenant_id = _tenant_id
    LIMIT 1
  ),
  global_pwd AS (
    SELECT trim(COALESCE(ss.setting_value, '')) AS pwd
    FROM public.system_settings ss
    WHERE ss.setting_key = 'schedule_reopen_password'
    LIMIT 1
  )
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_tenant_admin(auth.uid(), _tenant_id)
    )
    AND (
      (
        EXISTS (SELECT 1 FROM tenant_pwd tp WHERE tp.pwd <> '')
        AND EXISTS (
          SELECT 1
          FROM tenant_pwd tp
          WHERE tp.pwd = trim(COALESCE(_password, ''))
        )
      )
      OR
      (
        NOT EXISTS (SELECT 1 FROM tenant_pwd tp WHERE tp.pwd <> '')
        AND EXISTS (
          SELECT 1
          FROM global_pwd gp
          WHERE gp.pwd <> ''
            AND gp.pwd = trim(COALESCE(_password, ''))
        )
      )
    );
$$;

-- Keep compatibility wrapper signature used by old clients/cache.
CREATE OR REPLACE FUNCTION public.verify_schedule_reopen_password(_password text, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.verify_schedule_reopen_password(_tenant_id, _password);
$$;

REVOKE ALL ON FUNCTION public.verify_schedule_reopen_password(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.verify_schedule_reopen_password(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_schedule_reopen_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_schedule_reopen_password(text, uuid) TO authenticated;

