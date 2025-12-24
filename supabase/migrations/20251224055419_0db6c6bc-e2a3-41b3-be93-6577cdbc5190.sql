-- Create function to create tenant + admin membership in one transaction (avoids SELECT RLS on tenants during onboarding)
CREATE OR REPLACE FUNCTION public.create_tenant_with_admin(_name text, _slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_plan_id uuid;
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

  INSERT INTO public.tenants (name, slug, plan_id, created_by)
  VALUES (_name, _slug, v_plan_id, auth.uid())
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.memberships (tenant_id, user_id, role, active, created_by)
  VALUES (v_tenant_id, auth.uid(), 'admin', true, auth.uid());

  RETURN v_tenant_id;
END;
$$;

-- Allow authenticated users to execute the function
GRANT EXECUTE ON FUNCTION public.create_tenant_with_admin(text, text) TO authenticated;