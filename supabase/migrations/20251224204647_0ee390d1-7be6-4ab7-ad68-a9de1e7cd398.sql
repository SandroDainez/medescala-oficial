-- Create super_admins table for master admin access
CREATE TABLE IF NOT EXISTS public.super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Drop + recreate policy
DROP POLICY IF EXISTS "Super admins can view super_admins" ON public.super_admins;

CREATE POLICY "Super admins can view super_admins"
ON public.super_admins
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.super_admins
    WHERE user_id = auth.uid()
  )
);

-------------------------------------------------------
-- Is super admin helper
-------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins
    WHERE user_id = _user_id
  );
$$;

-------------------------------------------------------
-- Admin list tenants (SEM max_users AQUI)
-------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_all_tenants_admin()
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  billing_status text,
  is_unlimited boolean,
  trial_ends_at timestamptz,
  current_users_count integer,
  plan_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.billing_status,
    t.is_unlimited,
    t.trial_ends_at,
    t.current_users_count,
    p.name AS plan_name,
    t.created_at
  FROM public.tenants t
  LEFT JOIN public.plans p ON p.id = t.plan_id
  WHERE is_super_admin()
  ORDER BY t.created_at DESC;
$$;

-------------------------------------------------------
-- Admin update tenant access
-------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_tenant_access(
  _tenant_id uuid,
  _billing_status text DEFAULT NULL,
  _is_unlimited boolean DEFAULT NULL,
  _trial_ends_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can update tenant access';
  END IF;

  UPDATE public.tenants
  SET
    billing_status = COALESCE(_billing_status, billing_status),
    is_unlimited   = COALESCE(_is_unlimited, is_unlimited),
    trial_ends_at  = COALESCE(_trial_ends_at, trial_ends_at),
    updated_at     = now()
  WHERE id = _tenant_id;

  RETURN FOUND;
END;
$$;

