-- Drop existing policies and recreate with stronger tenant isolation

-- ============================================
-- FIX 1: profiles_private - Add tenant-scoped protection
-- ============================================

-- Drop existing user-level policies
DROP POLICY IF EXISTS "Users can view their own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can update their own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can insert their own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can delete their own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admins can view private profiles in their tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admins can update private profiles in their tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admins can insert private profiles for their users" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admins can delete private profiles in their tenant" ON public.profiles_private;

-- Create helper function to check if user has any active tenant membership
CREATE OR REPLACE FUNCTION public.user_has_active_membership(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = _user_id
      AND active = true
  )
$$;

-- New policies with tenant isolation for profiles_private
CREATE POLICY "Users can view own private profile if in active tenant"
ON public.profiles_private
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND user_has_active_membership(auth.uid())
);

CREATE POLICY "Users can update own private profile if in active tenant"
ON public.profiles_private
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND user_has_active_membership(auth.uid())
);

CREATE POLICY "Users can insert own private profile if in active tenant"
ON public.profiles_private
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND user_has_active_membership(auth.uid())
);

CREATE POLICY "Users can delete own private profile if in active tenant"
ON public.profiles_private
FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id 
  AND user_has_active_membership(auth.uid())
);

CREATE POLICY "Tenant admins can manage private profiles in their tenant"
ON public.profiles_private
FOR ALL
USING (
  auth.uid() IS NOT NULL 
  AND can_admin_access_profile(user_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND can_admin_access_profile(user_id)
);

-- ============================================
-- FIX 2: payments - Strengthen tenant isolation
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can view payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can delete payments" ON public.payments;

-- Create stronger helper function for payment access
CREATE OR REPLACE FUNCTION public.can_access_payment(_payment_tenant_id uuid, _payment_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    auth.uid() IS NOT NULL
    AND _payment_tenant_id IS NOT NULL
    AND (
      -- User can access their own payments if they are a member of that tenant
      (
        auth.uid() = _payment_user_id 
        AND EXISTS (
          SELECT 1 FROM public.memberships 
          WHERE user_id = auth.uid() 
          AND tenant_id = _payment_tenant_id 
          AND active = true
        )
      )
      OR
      -- Tenant admin can access all payments in their tenant
      EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = auth.uid() 
        AND tenant_id = _payment_tenant_id 
        AND role = 'admin' 
        AND active = true
      )
    )
$$;

-- New policies with strict tenant isolation for payments
CREATE POLICY "Users and admins can view payments with tenant check"
ON public.payments
FOR SELECT
USING (can_access_payment(tenant_id, user_id));

CREATE POLICY "Only tenant admins can insert payments"
ON public.payments
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND is_tenant_admin(auth.uid(), tenant_id)
);

CREATE POLICY "Only tenant admins can update payments"
ON public.payments
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND is_tenant_admin(auth.uid(), tenant_id)
);

CREATE POLICY "Only tenant admins can delete payments"
ON public.payments
FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND is_tenant_admin(auth.uid(), tenant_id)
);

-- ============================================
-- FIX 3: profiles - Add tenant-scoped protection
-- ============================================

-- Drop existing user-level policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can view profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can update profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can insert profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can delete profiles in their tenant" ON public.profiles;

-- New policies with tenant isolation for profiles
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL AND can_admin_access_profile(id));

CREATE POLICY "Tenant admins can manage profiles in their tenant"
ON public.profiles
FOR ALL
USING (auth.uid() IS NOT NULL AND can_admin_access_profile(id))
WITH CHECK (auth.uid() IS NOT NULL AND can_admin_access_profile(id));