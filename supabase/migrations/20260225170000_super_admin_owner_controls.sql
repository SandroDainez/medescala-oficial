-- Super admin hardening:
-- - Only owner(s) can grant/revoke super admin access
-- - Super admin checks respect active flag
-- - Bootstrap initial owner by trusted email

ALTER TABLE public.super_admins
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.super_admins
SET active = true,
    is_owner = COALESCE(is_owner, false),
    updated_at = now()
WHERE active IS DISTINCT FROM true
   OR is_owner IS NULL;

-- Bootstrap owner account by email (idempotent)
INSERT INTO public.super_admins (user_id, created_by, active, is_owner, updated_at)
SELECT au.id, au.id, true, true, now()
FROM auth.users au
WHERE lower(au.email) = 'sandrodainez1@gmail.com'
ON CONFLICT (user_id) DO UPDATE
SET active = true,
    is_owner = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins sa
    WHERE sa.user_id = _user_id
      AND sa.active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_app_owner(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins sa
    WHERE sa.user_id = _user_id
      AND sa.active = true
      AND sa.is_owner = true
  );
$$;

CREATE OR REPLACE FUNCTION public.list_super_admin_access()
RETURNS TABLE(
  user_id uuid,
  email text,
  profile_name text,
  active boolean,
  is_owner boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    sa.user_id,
    au.email::text,
    COALESCE(NULLIF(trim(p.full_name), ''), p.name) AS profile_name,
    sa.active,
    sa.is_owner,
    sa.created_at,
    sa.updated_at
  FROM public.super_admins sa
  LEFT JOIN auth.users au ON au.id = sa.user_id
  LEFT JOIN public.profiles p ON p.id = sa.user_id
  WHERE public.is_super_admin(auth.uid())
  ORDER BY sa.is_owner DESC, sa.active DESC, sa.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.set_super_admin_access(
  _target_user_id uuid,
  _active boolean DEFAULT true,
  _is_owner boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_owner_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_app_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only app owners can manage super admins';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user is required';
  END IF;

  INSERT INTO public.super_admins (user_id, created_by, active, is_owner, updated_at)
  VALUES (_target_user_id, auth.uid(), COALESCE(_active, true), COALESCE(_is_owner, false), now())
  ON CONFLICT (user_id) DO UPDATE
  SET active = COALESCE(_active, public.super_admins.active),
      is_owner = COALESCE(_is_owner, false),
      updated_at = now();

  SELECT COUNT(*)
  INTO v_owner_count
  FROM public.super_admins sa
  WHERE sa.active = true
    AND sa.is_owner = true;

  IF v_owner_count = 0 THEN
    RAISE EXCEPTION 'At least one active owner is required';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_super_admin_access_by_email(
  _email text,
  _active boolean DEFAULT true,
  _is_owner boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF _email IS NULL OR length(trim(_email)) = 0 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found for this email';
  END IF;

  RETURN public.set_super_admin_access(v_user_id, _active, _is_owner);
END;
$$;

REVOKE ALL ON FUNCTION public.is_app_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_super_admin_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_super_admin_access(uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_super_admin_access_by_email(text, boolean, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_app_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_super_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_super_admin_access(uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_super_admin_access_by_email(text, boolean, boolean) TO authenticated;

