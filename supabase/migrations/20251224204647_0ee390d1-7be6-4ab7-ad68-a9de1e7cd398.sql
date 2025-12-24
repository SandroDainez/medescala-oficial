-- Create super_admins table for master admin access
CREATE TABLE public.super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Only super admins can view the table
CREATE POLICY "Super admins can view super_admins" 
ON public.super_admins 
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
);

-- Create function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins
    WHERE user_id = _user_id
  )
$$;

-- Create function to list all tenants (for super admins only)
CREATE OR REPLACE FUNCTION public.get_all_tenants_admin()
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  billing_status text,
  is_unlimited boolean,
  trial_ends_at timestamp with time zone,
  current_users_count integer,
  max_users integer,
  plan_name text,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    t.id,
    t.name,
    t.slug,
    t.billing_status,
    t.is_unlimited,
    t.trial_ends_at,
    t.current_users_count,
    t.max_users,
    p.name as plan_name,
    t.created_at
  FROM public.tenants t
  LEFT JOIN public.plans p ON p.id = t.plan_id
  WHERE is_super_admin()
  ORDER BY t.created_at DESC
$$;

-- Create function to update tenant access (for super admins only)
CREATE OR REPLACE FUNCTION public.update_tenant_access(
  _tenant_id uuid,
  _billing_status text DEFAULT NULL,
  _is_unlimited boolean DEFAULT NULL,
  _trial_ends_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can update tenant access';
  END IF;

  UPDATE public.tenants
  SET 
    billing_status = COALESCE(_billing_status, billing_status),
    is_unlimited = COALESCE(_is_unlimited, is_unlimited),
    trial_ends_at = COALESCE(_trial_ends_at, trial_ends_at),
    updated_at = now()
  WHERE id = _tenant_id;

  RETURN FOUND;
END;
$$;