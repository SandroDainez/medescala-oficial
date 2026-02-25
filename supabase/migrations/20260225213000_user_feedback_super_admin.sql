BEGIN;

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('bad', 'neutral', 'good', 'excellent')),
  message text NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON public.user_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_tenant_id ON public.user_feedback (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON public.user_feedback (user_id);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.user_feedback;
CREATE POLICY "Users can insert own feedback"
ON public.user_feedback
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    tenant_id IS NULL
    OR public.is_tenant_member(auth.uid(), tenant_id)
    OR public.is_tenant_admin(auth.uid(), tenant_id)
  )
);

DROP POLICY IF EXISTS "Users can read own feedback" ON public.user_feedback;
CREATE POLICY "Users can read own feedback"
ON public.user_feedback
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admin can read feedback" ON public.user_feedback;
CREATE POLICY "Super admin can read feedback"
ON public.user_feedback
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin can update feedback" ON public.user_feedback;
CREATE POLICY "Super admin can update feedback"
ON public.user_feedback
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_user_feedback_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_feedback_updated_at ON public.user_feedback;
CREATE TRIGGER trg_user_feedback_updated_at
BEFORE UPDATE ON public.user_feedback
FOR EACH ROW
EXECUTE FUNCTION public.set_user_feedback_updated_at();

COMMIT;
