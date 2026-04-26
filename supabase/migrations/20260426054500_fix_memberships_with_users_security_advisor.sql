-- Fix Security Advisor findings on public.memberships_with_users.
-- 1. Remove any dependency on auth.users from the public view.
-- 2. Recreate the view as SECURITY INVOKER so it respects caller permissions.

DROP VIEW IF EXISTS public.memberships_with_users;

CREATE VIEW public.memberships_with_users
WITH (security_invoker = true) AS
SELECT
  m.id,
  m.tenant_id,
  m.user_id,
  m.role,
  m.active,
  m.created_at,
  p.email,
  p.name AS full_name,
  NULL::text AS phone
FROM public.memberships AS m
LEFT JOIN public.profiles AS p
  ON p.id = m.user_id;

GRANT SELECT ON public.memberships_with_users TO authenticated;
GRANT SELECT ON public.memberships_with_users TO service_role;
