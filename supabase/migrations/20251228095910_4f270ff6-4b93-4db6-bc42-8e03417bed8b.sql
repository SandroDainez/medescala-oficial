-- 1) Enable pgcrypto for field-level encryption helpers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Add encrypted columns to profiles_private (store ciphertext; decrypt only via backend function)
ALTER TABLE public.profiles_private
  ADD COLUMN IF NOT EXISTS cpf_enc bytea,
  ADD COLUMN IF NOT EXISTS crm_enc bytea,
  ADD COLUMN IF NOT EXISTS phone_enc bytea,
  ADD COLUMN IF NOT EXISTS address_enc bytea,
  ADD COLUMN IF NOT EXISTS bank_name_enc bytea,
  ADD COLUMN IF NOT EXISTS bank_agency_enc bytea,
  ADD COLUMN IF NOT EXISTS bank_account_enc bytea,
  ADD COLUMN IF NOT EXISTS pix_key_enc bytea;

COMMENT ON COLUMN public.profiles_private.cpf_enc IS 'Encrypted CPF (pgp_sym_encrypt). Plaintext cpf column will be deprecated.';
COMMENT ON COLUMN public.profiles_private.crm_enc IS 'Encrypted CRM (pgp_sym_encrypt). Plaintext crm column will be deprecated.';
COMMENT ON COLUMN public.profiles_private.phone_enc IS 'Encrypted phone (pgp_sym_encrypt). Plaintext phone column will be deprecated.';
COMMENT ON COLUMN public.profiles_private.address_enc IS 'Encrypted address (pgp_sym_encrypt). Plaintext address column will be deprecated.';
COMMENT ON COLUMN public.profiles_private.bank_name_enc IS 'Encrypted bank name (pgp_sym_encrypt). Plaintext bank_name will be deprecated.';
COMMENT ON COLUMN public.profiles_private.bank_agency_enc IS 'Encrypted bank agency (pgp_sym_encrypt). Plaintext bank_agency will be deprecated.';
COMMENT ON COLUMN public.profiles_private.bank_account_enc IS 'Encrypted bank account (pgp_sym_encrypt). Plaintext bank_account will be deprecated.';
COMMENT ON COLUMN public.profiles_private.pix_key_enc IS 'Encrypted PIX key (pgp_sym_encrypt). Plaintext pix_key will be deprecated.';

-- 3) Harden payments SELECT policy: single policy based on can_access_payment()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payments' AND policyname='Tenant admin can view all payments in tenant'
  ) THEN
    EXECUTE 'DROP POLICY "Tenant admin can view all payments in tenant" ON public.payments';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payments' AND policyname='User can view own payments in tenant'
  ) THEN
    EXECUTE 'DROP POLICY "User can view own payments in tenant" ON public.payments';
  END IF;
END $$;

CREATE POLICY "Users can view accessible payments"
ON public.payments
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND public.can_access_payment(tenant_id, user_id)
);
