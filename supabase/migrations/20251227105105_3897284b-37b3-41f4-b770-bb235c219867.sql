-- Prevent cross-tenant tampering by making tenant_id/user_id immutable on sensitive rows

CREATE OR REPLACE FUNCTION public.prevent_sensitive_fk_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block tenant_id changes (defense-in-depth against accidental or malicious edits)
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id cannot be changed';
  END IF;

  -- Block user_id changes on payments (prevents reassigning payment rows to another user)
  IF TG_TABLE_NAME = 'payments' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payments_prevent_sensitive_fk_updates'
  ) THEN
    CREATE TRIGGER trg_payments_prevent_sensitive_fk_updates
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_sensitive_fk_updates();
  END IF;
END;
$$;