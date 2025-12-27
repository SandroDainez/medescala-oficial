-- Fix RLS for profiles_private table (sensitive banking/medical data)
-- Drop existing policies and recreate as PERMISSIVE with proper auth checks

DROP POLICY IF EXISTS "Tenant admins can insert private profiles for their users" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admins can update private profiles in their tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admins can view private profiles in their tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can delete their own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can insert their own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can update their own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can view their own private profile" ON public.profiles_private;

-- Recreate policies as PERMISSIVE (which is the default and required for granting access)
CREATE POLICY "Users can view their own private profile"
ON public.profiles_private FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own private profile"
ON public.profiles_private FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own private profile"
ON public.profiles_private FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own private profile"
ON public.profiles_private FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Tenant admins can view private profiles in their tenant"
ON public.profiles_private FOR SELECT
TO authenticated
USING (can_admin_access_profile(user_id));

CREATE POLICY "Tenant admins can insert private profiles for their users"
ON public.profiles_private FOR INSERT
TO authenticated
WITH CHECK (can_admin_access_profile(user_id));

CREATE POLICY "Tenant admins can update private profiles in their tenant"
ON public.profiles_private FOR UPDATE
TO authenticated
USING (can_admin_access_profile(user_id));

CREATE POLICY "Tenant admins can delete private profiles in their tenant"
ON public.profiles_private FOR DELETE
TO authenticated
USING (can_admin_access_profile(user_id));

-- Fix RLS for profiles table
DROP POLICY IF EXISTS "Tenant admins can insert profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can update profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can view profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
ON public.profiles FOR DELETE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles FOR SELECT
TO authenticated
USING (can_admin_access_profile(id));

CREATE POLICY "Tenant admins can insert profiles in their tenant"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (can_admin_access_profile(id));

CREATE POLICY "Tenant admins can update profiles in their tenant"
ON public.profiles FOR UPDATE
TO authenticated
USING (can_admin_access_profile(id));

CREATE POLICY "Tenant admins can delete profiles in their tenant"
ON public.profiles FOR DELETE
TO authenticated
USING (can_admin_access_profile(id));

-- Fix RLS for payments table
DROP POLICY IF EXISTS "Tenant admins can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can view payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;

CREATE POLICY "Users can view their own payments"
ON public.payments FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can view payments"
ON public.payments FOR SELECT
TO authenticated
USING (is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can insert payments"
ON public.payments FOR INSERT
TO authenticated
WITH CHECK (is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can update payments"
ON public.payments FOR UPDATE
TO authenticated
USING (is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can delete payments"
ON public.payments FOR DELETE
TO authenticated
USING (is_tenant_admin(auth.uid(), tenant_id));