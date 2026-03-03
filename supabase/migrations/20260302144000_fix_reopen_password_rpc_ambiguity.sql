-- Remove ambiguous overload for verify_schedule_reopen_password.
-- Keep only canonical signature: (_tenant_id uuid, _password text).

DROP FUNCTION IF EXISTS public.verify_schedule_reopen_password(text, uuid);

REVOKE ALL ON FUNCTION public.verify_schedule_reopen_password(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_schedule_reopen_password(uuid, text) TO authenticated;
