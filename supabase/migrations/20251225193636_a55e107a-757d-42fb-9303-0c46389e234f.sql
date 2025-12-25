-- Tighten access checks for sensitive tables to explicitly require authentication

-- PROFILES
DROP POLICY IF EXISTS "Tenant admins can view profiles in their tenant" ON public.profiles;
CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    auth.uid() = id
    OR public.can_admin_access_profile(id)
  )
);

DROP POLICY IF EXISTS "Tenant admins can update profiles in their tenant" ON public.profiles;
CREATE POLICY "Tenant admins can update profiles in their tenant"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND (
    auth.uid() = id
    OR public.can_admin_access_profile(id)
  )
);

DROP POLICY IF EXISTS "Tenant admins can insert profiles in their tenant" ON public.profiles;
CREATE POLICY "Tenant admins can insert profiles in their tenant"
ON public.profiles
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    auth.uid() = id
    OR public.can_admin_access_profile(id)
  )
);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

-- PAYMENTS
-- Ensure tenant_id is non-null as required by policy assumptions
ALTER TABLE public.payments
ALTER COLUMN tenant_id SET NOT NULL;

DROP POLICY IF EXISTS "Tenant admins can manage all payments" ON public.payments;
CREATE POLICY "Tenant admins can manage all payments"
ON public.payments
FOR ALL
USING (auth.uid() IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Users can view their payments in tenant" ON public.payments;
CREATE POLICY "Users can view their payments in tenant"
ON public.payments
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND public.is_tenant_member(auth.uid(), tenant_id)
  AND user_id = auth.uid()
);
