-- 1) payments: simplify "Users can view own payments" policy to a direct membership check
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'Users can view own payments'
  ) THEN
    EXECUTE 'DROP POLICY "Users can view own payments" ON public.payments';
  END IF;
END $$;

CREATE POLICY "Users can view own payments"
ON public.payments
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND is_tenant_member(auth.uid(), tenant_id)
);


-- 2) shift_assignment_locations: simplify INSERT policy; enforce integrity with trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shift_assignment_locations'
      AND policyname = 'Users can insert own assignment locations with validation'
  ) THEN
    EXECUTE 'DROP POLICY "Users can insert own assignment locations with validation" ON public.shift_assignment_locations';
  END IF;
END $$;

CREATE POLICY "Users can insert own assignment locations"
ON public.shift_assignment_locations
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND is_tenant_member(auth.uid(), tenant_id)
);

-- Validation trigger (defense-in-depth): ensure assignment belongs to (tenant_id, user_id)
CREATE OR REPLACE FUNCTION public.validate_shift_assignment_location_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.assignment_id IS NULL OR NEW.user_id IS NULL OR NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'assignment_id, user_id, tenant_id are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.id = NEW.assignment_id
      AND sa.user_id = NEW.user_id
      AND sa.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Invalid assignment_id for given user/tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_shift_assignment_location_row ON public.shift_assignment_locations;
CREATE TRIGGER trg_validate_shift_assignment_location_row
BEFORE INSERT OR UPDATE ON public.shift_assignment_locations
FOR EACH ROW
EXECUTE FUNCTION public.validate_shift_assignment_location_row();


-- 3) login-cpf rate limit table (service-only; no client RLS access)
CREATE TABLE IF NOT EXISTS public.login_cpf_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  first_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  last_attempt_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.login_cpf_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'login_cpf_rate_limits'
      AND policyname = 'No client access to login_cpf_rate_limits'
  ) THEN
    CREATE POLICY "No client access to login_cpf_rate_limits"
    ON public.login_cpf_rate_limits
    FOR ALL
    USING (false)
    WITH CHECK (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_login_cpf_rate_limits_last_attempt
  ON public.login_cpf_rate_limits (last_attempt_at DESC);
