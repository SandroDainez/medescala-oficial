-- =====================================================
-- FIX: Strengthen RLS for profiles_private, profiles, and payments
-- Ensure proper tenant isolation and defense in depth
-- =====================================================

-- ===================
-- 1. Improve can_admin_access_profile function
-- Ensure it checks that admin is in the SAME tenant as the profile owner
-- ===================

CREATE OR REPLACE FUNCTION public.can_admin_access_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships admin_m
    WHERE admin_m.user_id = auth.uid()
      AND admin_m.role = 'admin'
      AND admin_m.active = true
      AND EXISTS (
        SELECT 1
        FROM public.memberships profile_m
        WHERE profile_m.user_id = _profile_id
          AND profile_m.tenant_id = admin_m.tenant_id
          AND profile_m.active = true
      )
  )
$$;

-- ===================
-- 2. PROFILES_PRIVATE - Only owner + admin of same tenant
-- ===================

DROP POLICY IF EXISTS "Users can view own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can insert own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can update own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can delete own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admins can manage private profiles" ON public.profiles_private;

-- Owner policies
CREATE POLICY "Owner can view own private profile"
ON public.profiles_private
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Owner can insert own private profile"
ON public.profiles_private
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Owner can update own private profile"
ON public.profiles_private
FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Owner can delete own private profile"
ON public.profiles_private
FOR DELETE
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Admin of same tenant can view/manage
CREATE POLICY "Tenant admin can view private profile in their tenant"
ON public.profiles_private
FOR SELECT
USING (auth.uid() IS NOT NULL AND public.can_admin_access_profile(user_id));

CREATE POLICY "Tenant admin can update private profile in their tenant"
ON public.profiles_private
FOR UPDATE
USING (auth.uid() IS NOT NULL AND public.can_admin_access_profile(user_id))
WITH CHECK (auth.uid() IS NOT NULL AND public.can_admin_access_profile(user_id));

-- ===================
-- 3. PROFILES - Only owner + admin of same tenant
-- ===================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can view profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can manage profiles in their tenant" ON public.profiles;

-- Owner policies
CREATE POLICY "Owner can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Owner can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Owner can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = id)
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

-- Admin of same tenant
CREATE POLICY "Tenant admin can view profile in their tenant"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL AND public.can_admin_access_profile(id));

CREATE POLICY "Tenant admin can update profile in their tenant"
ON public.profiles
FOR UPDATE
USING (auth.uid() IS NOT NULL AND public.can_admin_access_profile(id))
WITH CHECK (auth.uid() IS NOT NULL AND public.can_admin_access_profile(id));

-- ===================
-- 4. PAYMENTS - Pure RLS policies (remove function dependency for SELECT)
-- ===================

DROP POLICY IF EXISTS "Users and admins can view payments with tenant check" ON public.payments;
DROP POLICY IF EXISTS "Only tenant admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Only tenant admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Only tenant admins can delete payments" ON public.payments;

-- Users can view their own payments if they are a member of that tenant
CREATE POLICY "User can view own payments in tenant"
ON public.payments
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND public.is_tenant_member(auth.uid(), tenant_id)
);

-- Tenant admins can view all payments in their tenant
CREATE POLICY "Tenant admin can view all payments in tenant"
ON public.payments
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND public.is_tenant_admin(auth.uid(), tenant_id)
);

-- Tenant admins can insert payments in their tenant
CREATE POLICY "Tenant admin can insert payments"
ON public.payments
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND public.is_tenant_admin(auth.uid(), tenant_id)
);

-- Tenant admins can update payments in their tenant
CREATE POLICY "Tenant admin can update payments"
ON public.payments
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND public.is_tenant_admin(auth.uid(), tenant_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND public.is_tenant_admin(auth.uid(), tenant_id)
);

-- Tenant admins can delete payments in their tenant
CREATE POLICY "Tenant admin can delete payments"
ON public.payments
FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND public.is_tenant_admin(auth.uid(), tenant_id)
);