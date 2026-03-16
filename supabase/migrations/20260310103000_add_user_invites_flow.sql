BEGIN;

CREATE TABLE IF NOT EXISTS public.user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id),
  used_at timestamptz NULL,
  revoked_at timestamptz NULL,
  revoked_by uuid NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_invites_lookup
  ON public.user_invites (tenant_id, user_id, used_at, revoked_at);

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invites FORCE ROW LEVEL SECURITY;

CREATE POLICY "Block anon access on user_invites"
ON public.user_invites
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Block authenticated direct access on user_invites"
ON public.user_invites
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

GRANT ALL ON TABLE public.user_invites TO service_role;

COMMIT;
