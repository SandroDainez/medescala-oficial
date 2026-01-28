-- Fix: audit trigger can run under service role (auth.uid() is NULL). Prevent null user_id in pii_audit_logs.
-- Use COALESCE(auth.uid(), NEW.user_id/OLD.user_id) so writes from backend don't fail.

CREATE OR REPLACE FUNCTION public.audit_profiles_private_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.user_id, OLD.user_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pii_audit_logs (table_name, record_id, user_id, tenant_id, action, new_data)
    VALUES (
      'profiles_private',
      NEW.user_id,
      v_actor,
      NEW.tenant_id,
      'INSERT',
      jsonb_build_object('has_cpf', NEW.cpf_enc IS NOT NULL, 'has_bank', NEW.bank_account_enc IS NOT NULL)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.pii_audit_logs (table_name, record_id, user_id, tenant_id, action, old_data, new_data)
    VALUES (
      'profiles_private',
      NEW.user_id,
      v_actor,
      NEW.tenant_id,
      'UPDATE',
      jsonb_build_object('has_cpf', OLD.cpf_enc IS NOT NULL, 'has_bank', OLD.bank_account_enc IS NOT NULL),
      jsonb_build_object('has_cpf', NEW.cpf_enc IS NOT NULL, 'has_bank', NEW.bank_account_enc IS NOT NULL)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.pii_audit_logs (table_name, record_id, user_id, tenant_id, action, old_data)
    VALUES (
      'profiles_private',
      OLD.user_id,
      COALESCE(auth.uid(), OLD.user_id),
      OLD.tenant_id,
      'DELETE',
      jsonb_build_object('has_cpf', OLD.cpf_enc IS NOT NULL, 'has_bank', OLD.bank_account_enc IS NOT NULL)
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;