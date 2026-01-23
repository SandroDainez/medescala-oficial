-- Create audit log table for sensitive data access
CREATE TABLE IF NOT EXISTS public.pii_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tenant_id uuid,
  action text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.pii_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can view audit logs
CREATE POLICY "Super admins can view audit logs"
ON public.pii_audit_logs
FOR SELECT
USING (is_super_admin(auth.uid()));

-- No one can modify audit logs directly
CREATE POLICY "No client modifications to audit logs"
ON public.pii_audit_logs
FOR ALL
USING (false)
WITH CHECK (false);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION public.audit_profiles_private_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pii_audit_logs (table_name, record_id, user_id, tenant_id, action, new_data)
    VALUES ('profiles_private', NEW.user_id, auth.uid(), NEW.tenant_id, 'INSERT', 
            jsonb_build_object('has_cpf', NEW.cpf_enc IS NOT NULL, 'has_bank', NEW.bank_account_enc IS NOT NULL));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.pii_audit_logs (table_name, record_id, user_id, tenant_id, action, old_data, new_data)
    VALUES ('profiles_private', NEW.user_id, auth.uid(), NEW.tenant_id, 'UPDATE',
            jsonb_build_object('has_cpf', OLD.cpf_enc IS NOT NULL, 'has_bank', OLD.bank_account_enc IS NOT NULL),
            jsonb_build_object('has_cpf', NEW.cpf_enc IS NOT NULL, 'has_bank', NEW.bank_account_enc IS NOT NULL));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.pii_audit_logs (table_name, record_id, user_id, tenant_id, action, old_data)
    VALUES ('profiles_private', OLD.user_id, auth.uid(), OLD.tenant_id, 'DELETE',
            jsonb_build_object('has_cpf', OLD.cpf_enc IS NOT NULL, 'has_bank', OLD.bank_account_enc IS NOT NULL));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger on profiles_private
DROP TRIGGER IF EXISTS audit_profiles_private ON public.profiles_private;
CREATE TRIGGER audit_profiles_private
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles_private
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_private_changes();

-- Add index for faster queries on audit logs
CREATE INDEX IF NOT EXISTS idx_pii_audit_logs_user_id ON public.pii_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pii_audit_logs_created_at ON public.pii_audit_logs(created_at DESC);