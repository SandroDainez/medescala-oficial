-- Drop existing problematic admin policies on profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;

-- Create a function to check if admin can access a profile (same tenant)
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
    JOIN public.memberships profile_m ON admin_m.tenant_id = profile_m.tenant_id
    WHERE admin_m.user_id = auth.uid()
      AND admin_m.role = 'admin'
      AND admin_m.active = true
      AND profile_m.user_id = _profile_id
      AND profile_m.active = true
  )
$$;

-- Create tenant-scoped admin policies for profiles
CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id 
  OR can_admin_access_profile(id)
);

CREATE POLICY "Tenant admins can update profiles in their tenant"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() = id 
  OR can_admin_access_profile(id)
);

CREATE POLICY "Tenant admins can insert profiles in their tenant"
ON public.profiles
FOR INSERT
WITH CHECK (
  auth.uid() = id 
  OR can_admin_access_profile(id)
);