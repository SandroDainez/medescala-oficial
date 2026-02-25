-- Restore GABS custom reopen password after default rollout.
UPDATE public.tenant_security_settings s
SET
  schedule_reopen_password = 'reabrir2026sandro',
  must_change_reopen_password = false,
  updated_at = now()
FROM public.tenants t
WHERE s.tenant_id = t.id
  AND lower(t.slug) = 'gabs';
