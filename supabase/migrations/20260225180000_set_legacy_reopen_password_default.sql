-- Legacy compatibility:
-- In older databases that still validate reopen password via system_settings,
-- enforce the requested password value.

INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'schedule_reopen_password',
  'reabrir2026sandro',
  'Senha necessária para reabrir escalas finalizadas'
)
ON CONFLICT (setting_key)
DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = now();

