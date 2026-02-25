-- Make tenant delete confirmation more robust and user-friendly.
CREATE OR REPLACE FUNCTION public.super_admin_delete_tenant(
  _tenant_id uuid,
  _confirm_slug text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_slug text;
  v_name text;
  v_expected_slug text;
  v_confirm text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only app owners can delete tenants';
  END IF;

  SELECT slug, name
  INTO v_slug, v_name
  FROM public.tenants
  WHERE id = _tenant_id;

  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF lower(v_slug) = 'gabs' THEN
    RAISE EXCEPTION 'Tenant GABS é protegido e não pode ser removido';
  END IF;

  v_expected_slug := lower(trim(v_slug));
  v_confirm := lower(trim(COALESCE(_confirm_slug, '')));

  -- Accept:
  -- - exact slug (case-insensitive)
  -- - normalized slug/name without symbols/spaces for convenience
  IF NOT (
    v_confirm = v_expected_slug
    OR regexp_replace(v_confirm, '[^a-z0-9]', '', 'g')
       = regexp_replace(v_expected_slug, '[^a-z0-9]', '', 'g')
    OR regexp_replace(v_confirm, '[^a-z0-9]', '', 'g')
       = regexp_replace(lower(trim(COALESCE(v_name, ''))), '[^a-z0-9]', '', 'g')
  ) THEN
    RAISE EXCEPTION 'Confirmação inválida. Digite o código: %', v_slug;
  END IF;

  DELETE FROM public.tenants
  WHERE id = _tenant_id;

  RETURN FOUND;
END;
$$;
