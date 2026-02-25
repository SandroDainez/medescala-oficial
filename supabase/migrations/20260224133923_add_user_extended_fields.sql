-- ============================
-- EXTENSÃO DE PERFIL (SaaS Premium)
-- ============================

-- PUBLIC PROFILES (dados básicos visíveis)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo';

-- PRIVATE PROFILES (dados sensíveis criptografados)
ALTER TABLE public.profiles_private
ADD COLUMN IF NOT EXISTS rg_enc bytea,
ADD COLUMN IF NOT EXISTS phone_enc bytea,
ADD COLUMN IF NOT EXISTS address_enc bytea,
ADD COLUMN IF NOT EXISTS crm_enc bytea,
ADD COLUMN IF NOT EXISTS rqe_enc bytea,
ADD COLUMN IF NOT EXISTS bank_name_enc bytea,
ADD COLUMN IF NOT EXISTS bank_agency_enc bytea,
ADD COLUMN IF NOT EXISTS bank_account_enc bytea,
ADD COLUMN IF NOT EXISTS pix_key_enc bytea,
ADD COLUMN IF NOT EXISTS pix_type_enc bytea,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS last_updated_by uuid;