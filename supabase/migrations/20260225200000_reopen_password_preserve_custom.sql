-- Fix: do not overwrite customized reopen passwords.
-- Keep 123456 only as initial/default for tenants without password.

-- Ensure each tenant has a row.
INSERT INTO public.tenant_security_settings (tenant_id, schedule_reopen_password, must_change_reopen_password, updated_at)
SELECT t.id, '123456', true, now()
FROM public.tenants t
LEFT JOIN public.tenant_security_settings s ON s.tenant_id = t.id
WHERE s.tenant_id IS NULL;

-- If password is missing/empty, set default 123456 and force change.
UPDATE public.tenant_security_settings
SET
  schedule_reopen_password = '123456',
  must_change_reopen_password = true,
  updated_at = now()
WHERE schedule_reopen_password IS NULL
   OR length(trim(schedule_reopen_password)) = 0;

-- If tenant already has a non-default password, preserve it and remove force-change.
UPDATE public.tenant_security_settings
SET
  must_change_reopen_password = false,
  updated_at = now()
WHERE schedule_reopen_password IS NOT NULL
  AND trim(schedule_reopen_password) <> ''
  AND trim(schedule_reopen_password) <> '123456';
