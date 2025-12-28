-- Remove plaintext PII columns from profiles_private
-- This migration should only run AFTER data has been migrated to encrypted columns

-- Drop the plaintext columns (data should already be in *_enc columns)
ALTER TABLE public.profiles_private DROP COLUMN IF EXISTS cpf;
ALTER TABLE public.profiles_private DROP COLUMN IF EXISTS crm;
ALTER TABLE public.profiles_private DROP COLUMN IF EXISTS phone;
ALTER TABLE public.profiles_private DROP COLUMN IF EXISTS address;
ALTER TABLE public.profiles_private DROP COLUMN IF EXISTS bank_name;
ALTER TABLE public.profiles_private DROP COLUMN IF EXISTS bank_agency;
ALTER TABLE public.profiles_private DROP COLUMN IF EXISTS bank_account;
ALTER TABLE public.profiles_private DROP COLUMN IF EXISTS pix_key;

COMMENT ON TABLE public.profiles_private IS 'Private user profile data with encrypted PII fields. All sensitive data stored in *_enc columns using AES-GCM encryption.';