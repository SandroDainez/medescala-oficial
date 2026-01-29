-- Harden has_pii_access: require admin role or super_admin (in addition to temporal grant)
CREATE OR REPLACE FUNCTION public.has_pii_access(_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    )
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.pii_access_permissions pap
      WHERE pap.user_id = auth.uid()
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;

-- Overload version with explicit user_id
CREATE OR REPLACE FUNCTION public.has_pii_access(_user_id uuid, _tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(_user_id, _tenant_id)
      OR public.is_super_admin(_user_id)
    )
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.pii_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;

-- Harden has_payment_access: require admin role (in addition to temporal grant)
CREATE OR REPLACE FUNCTION public.has_payment_access(_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    )
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = auth.uid()
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;

-- Overload version with explicit user_id
CREATE OR REPLACE FUNCTION public.has_payment_access(_user_id uuid, _tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(_user_id, _tenant_id)
      OR public.is_super_admin(_user_id)
    )
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;

-- Harden has_gps_access: require admin role (in addition to temporal grant)
CREATE OR REPLACE FUNCTION public.has_gps_access(_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    )
    -- Must be tenant member
    AND is_tenant_member(auth.uid(), _tenant_id)
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.gps_access_grants gag
      WHERE gag.user_id = auth.uid()
        AND gag.tenant_id = _tenant_id
        AND gag.expires_at IS NOT NULL
        AND gag.expires_at > now()
    )
  )
$$;

-- Overload version with explicit user_id
CREATE OR REPLACE FUNCTION public.has_gps_access(_user_id uuid, _tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(_user_id, _tenant_id)
      OR public.is_super_admin(_user_id)
    )
    -- Must be tenant member
    AND is_tenant_member(_user_id, _tenant_id)
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.gps_access_grants gag
      WHERE gag.user_id = _user_id
        AND gag.tenant_id = _tenant_id
        AND gag.expires_at IS NOT NULL
        AND gag.expires_at > now()
    )
  )
$$;