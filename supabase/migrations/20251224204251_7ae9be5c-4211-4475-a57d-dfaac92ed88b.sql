-- Add is_unlimited flag to tenants for special cases like GABS
ALTER TABLE public.tenants 
ADD COLUMN is_unlimited boolean NOT NULL DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.tenants.is_unlimited IS 'When true, tenant has no trial expiration (e.g., GABS)';

-- Update billing_status enum-like values
-- Values: 'trial', 'active', 'expired', 'cancelled'
-- The default is already 'active', let's change it to 'trial' for new tenants
ALTER TABLE public.tenants 
ALTER COLUMN billing_status SET DEFAULT 'trial';

-- Create function to calculate trial end date (last day of current month)
CREATE OR REPLACE FUNCTION public.calculate_trial_end_date()
RETURNS timestamp with time zone
LANGUAGE sql
IMMUTABLE
AS $$
  -- Always end on the last day of the current month at 23:59:59
  SELECT (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 second')::timestamp with time zone
$$;

-- Update create_tenant_with_admin to set trial_ends_at
CREATE OR REPLACE FUNCTION public.create_tenant_with_admin(_name text, _slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_plan_id uuid;
  v_trial_end timestamp with time zone;
  v_is_unlimited boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_plan_id
  FROM public.plans
  WHERE active = true AND name = 'Gratuito'
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Default plan not found';
  END IF;

  -- Calculate trial end date (last day of current month)
  v_trial_end := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 second')::timestamp with time zone;
  
  -- Check if this is GABS (unlimited)
  v_is_unlimited := (LOWER(_slug) = 'gabs');

  INSERT INTO public.tenants (name, slug, plan_id, created_by, billing_status, trial_ends_at, is_unlimited)
  VALUES (_name, _slug, v_plan_id, auth.uid(), 'trial', v_trial_end, v_is_unlimited)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.memberships (tenant_id, user_id, role, active, created_by)
  VALUES (v_tenant_id, auth.uid(), 'admin', true, auth.uid());

  RETURN v_tenant_id;
END;
$$;

-- Create function to check if tenant has active access
CREATE OR REPLACE FUNCTION public.is_tenant_access_active(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      WHEN is_unlimited THEN true
      WHEN billing_status = 'active' THEN true
      WHEN billing_status = 'trial' AND trial_ends_at > NOW() THEN true
      ELSE false
    END
  FROM public.tenants
  WHERE id = _tenant_id
$$;

-- Create function to get tenant subscription status
CREATE OR REPLACE FUNCTION public.get_tenant_access_status(_tenant_id uuid)
RETURNS TABLE(
  status text,
  is_unlimited boolean,
  trial_ends_at timestamp with time zone,
  days_remaining integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    t.billing_status,
    t.is_unlimited,
    t.trial_ends_at,
    CASE 
      WHEN t.is_unlimited THEN NULL
      WHEN t.trial_ends_at IS NULL THEN 0
      ELSE GREATEST(0, EXTRACT(DAY FROM (t.trial_ends_at - NOW()))::integer)
    END
  FROM public.tenants t
  WHERE t.id = _tenant_id
$$;