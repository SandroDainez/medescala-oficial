-- Create table for PII access permissions (managed by super admins only)
CREATE TABLE public.pii_access_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (tenant_id, user_id)
);

-- Enable RLS
ALTER TABLE public.pii_access_permissions ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage PII access permissions
CREATE POLICY "Super admins can manage pii_access_permissions"
ON public.pii_access_permissions
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant admins can view permissions in their tenant (read-only)
CREATE POLICY "Tenant admins can view pii_access_permissions"
ON public.pii_access_permissions
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND public.is_tenant_admin(auth.uid(), tenant_id)
);

-- Create helper function to check PII access
CREATE OR REPLACE FUNCTION public.has_pii_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pii_access_permissions
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
  )
$$;

-- Drop the old tenant admin policy on profiles_private
DROP POLICY IF EXISTS "Tenant admins can view private profiles in tenant" ON public.profiles_private;

-- Create new policy: only users with explicit PII access permission can view
CREATE POLICY "Users with PII permission can view private profiles in tenant"
ON public.profiles_private
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND public.has_pii_access(auth.uid(), tenant_id)
);