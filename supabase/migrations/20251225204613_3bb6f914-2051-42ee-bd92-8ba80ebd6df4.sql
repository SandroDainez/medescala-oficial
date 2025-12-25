-- 1) PROFILES: move sensitive fields into a separate table
CREATE TABLE IF NOT EXISTS public.profiles_private (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone TEXT,
  cpf TEXT,
  crm TEXT,
  address TEXT,
  bank_name TEXT,
  bank_agency TEXT,
  bank_account TEXT,
  pix_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

-- Only the profile owner or a tenant admin of any shared tenant can access
DROP POLICY IF EXISTS "Users can view their own private profile" ON public.profiles_private;
CREATE POLICY "Users can view their own private profile"
ON public.profiles_private
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Tenant admins can view private profiles in their tenant" ON public.profiles_private;
CREATE POLICY "Tenant admins can view private profiles in their tenant"
ON public.profiles_private
FOR SELECT
USING (auth.uid() IS NOT NULL AND public.can_admin_access_profile(user_id));

DROP POLICY IF EXISTS "Users can upsert their own private profile" ON public.profiles_private;
CREATE POLICY "Users can upsert their own private profile"
ON public.profiles_private
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own private profile" ON public.profiles_private;
CREATE POLICY "Users can update their own private profile"
ON public.profiles_private
FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Tenant admins can update private profiles in their tenant" ON public.profiles_private;
CREATE POLICY "Tenant admins can update private profiles in their tenant"
ON public.profiles_private
FOR UPDATE
USING (auth.uid() IS NOT NULL AND public.can_admin_access_profile(user_id));

-- timestamps
DROP TRIGGER IF EXISTS update_profiles_private_updated_at ON public.profiles_private;
CREATE TRIGGER update_profiles_private_updated_at
BEFORE UPDATE ON public.profiles_private
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill private data from profiles (idempotent)
INSERT INTO public.profiles_private (user_id, phone, cpf, crm, address, bank_name, bank_agency, bank_account, pix_key)
SELECT id, phone, cpf, crm, address, bank_name, bank_agency, bank_account, pix_key
FROM public.profiles
ON CONFLICT (user_id) DO UPDATE SET
  phone = EXCLUDED.phone,
  cpf = EXCLUDED.cpf,
  crm = EXCLUDED.crm,
  address = EXCLUDED.address,
  bank_name = EXCLUDED.bank_name,
  bank_agency = EXCLUDED.bank_agency,
  bank_account = EXCLUDED.bank_account,
  pix_key = EXCLUDED.pix_key;

-- Remove sensitive columns from public.profiles
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS cpf,
  DROP COLUMN IF EXISTS crm,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS bank_agency,
  DROP COLUMN IF EXISTS bank_account,
  DROP COLUMN IF EXISTS pix_key;


-- 2) PAYMENTS: strengthen tenant isolation for user self-access
-- Replace the self-view policy to require tenant membership
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
CREATE POLICY "Users can view their own payments"
ON public.payments
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND public.is_tenant_member(auth.uid(), tenant_id)
);


-- 3) SHIFT ASSIGNMENTS: move GPS coordinates into a separate table
CREATE TABLE IF NOT EXISTS public.shift_assignment_locations (
  assignment_id UUID PRIMARY KEY REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checkin_latitude NUMERIC,
  checkin_longitude NUMERIC,
  checkout_latitude NUMERIC,
  checkout_longitude NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_assignment_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can manage assignment locations" ON public.shift_assignment_locations;
CREATE POLICY "Tenant admins can manage assignment locations"
ON public.shift_assignment_locations
FOR ALL
USING (public.is_tenant_admin(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Users can view their own assignment locations" ON public.shift_assignment_locations;
CREATE POLICY "Users can view their own assignment locations"
ON public.shift_assignment_locations
FOR SELECT
USING (auth.uid() IS NOT NULL AND user_id = auth.uid() AND public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Users can upsert their own assignment locations" ON public.shift_assignment_locations;
CREATE POLICY "Users can upsert their own assignment locations"
ON public.shift_assignment_locations
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid() AND public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Users can update their own assignment locations" ON public.shift_assignment_locations;
CREATE POLICY "Users can update their own assignment locations"
ON public.shift_assignment_locations
FOR UPDATE
USING (auth.uid() IS NOT NULL AND user_id = auth.uid() AND public.is_tenant_member(auth.uid(), tenant_id));

DROP TRIGGER IF EXISTS update_shift_assignment_locations_updated_at ON public.shift_assignment_locations;
CREATE TRIGGER update_shift_assignment_locations_updated_at
BEFORE UPDATE ON public.shift_assignment_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill location rows from shift_assignments (idempotent)
INSERT INTO public.shift_assignment_locations (
  assignment_id,
  tenant_id,
  user_id,
  checkin_latitude,
  checkin_longitude,
  checkout_latitude,
  checkout_longitude
)
SELECT
  id,
  tenant_id,
  user_id,
  checkin_latitude,
  checkin_longitude,
  checkout_latitude,
  checkout_longitude
FROM public.shift_assignments
WHERE tenant_id IS NOT NULL
ON CONFLICT (assignment_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  user_id = EXCLUDED.user_id,
  checkin_latitude = EXCLUDED.checkin_latitude,
  checkin_longitude = EXCLUDED.checkin_longitude,
  checkout_latitude = EXCLUDED.checkout_latitude,
  checkout_longitude = EXCLUDED.checkout_longitude;

-- Remove GPS columns from shift_assignments so they are not exposed via API
ALTER TABLE public.shift_assignments
  DROP COLUMN IF EXISTS checkin_latitude,
  DROP COLUMN IF EXISTS checkin_longitude,
  DROP COLUMN IF EXISTS checkout_latitude,
  DROP COLUMN IF EXISTS checkout_longitude;
