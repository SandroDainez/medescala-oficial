-- Compatibility fix for RPC schema cache/signature resolution:
-- Some clients resolve verify_schedule_reopen_password as (_password, _tenant_id).
-- Keep a wrapper with this signature to avoid runtime errors.

CREATE OR REPLACE FUNCTION public.verify_schedule_reopen_password(_password text, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.verify_schedule_reopen_password(_tenant_id, _password);
$$;

REVOKE ALL ON FUNCTION public.verify_schedule_reopen_password(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_schedule_reopen_password(text, uuid) TO authenticated;

