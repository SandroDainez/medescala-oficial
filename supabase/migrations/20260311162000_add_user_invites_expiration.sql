BEGIN;

ALTER TABLE public.user_invites
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

UPDATE public.user_invites
SET expires_at = created_at + interval '48 hours'
WHERE expires_at IS NULL
  AND used_at IS NULL
  AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_invites_token_active
  ON public.user_invites (token_hash, expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

COMMIT;
