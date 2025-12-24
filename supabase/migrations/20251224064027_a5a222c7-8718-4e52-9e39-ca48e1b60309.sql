-- Add new optional fields to profiles table for doctor/user information
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS cpf text,
ADD COLUMN IF NOT EXISTS crm text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS bank_agency text,
ADD COLUMN IF NOT EXISTS bank_account text,
ADD COLUMN IF NOT EXISTS pix_key text,
ADD COLUMN IF NOT EXISTS profile_type text DEFAULT 'plantonista';

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.phone IS 'Phone number';
COMMENT ON COLUMN public.profiles.cpf IS 'CPF document number';
COMMENT ON COLUMN public.profiles.crm IS 'CRM medical registration number';
COMMENT ON COLUMN public.profiles.address IS 'Full address';
COMMENT ON COLUMN public.profiles.bank_name IS 'Bank name for payments';
COMMENT ON COLUMN public.profiles.bank_agency IS 'Bank agency number';
COMMENT ON COLUMN public.profiles.bank_account IS 'Bank account number';
COMMENT ON COLUMN public.profiles.pix_key IS 'PIX key for payments';
COMMENT ON COLUMN public.profiles.profile_type IS 'Profile type: plantonista, administrador, outros';