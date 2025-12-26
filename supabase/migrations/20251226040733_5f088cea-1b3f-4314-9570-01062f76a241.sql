-- =====================================================
-- FIX SECURITY: Ensure all sensitive tables block anonymous access
-- =====================================================

-- 1. Ensure RLS is enabled on all sensitive tables
ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignment_locations ENABLE ROW LEVEL SECURITY;

-- 2. Force RLS for table owners as well (extra security)
ALTER TABLE public.profiles_private FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignment_locations FORCE ROW LEVEL SECURITY;

-- 3. Revoke direct public access (defense in depth)
REVOKE ALL ON public.profiles_private FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.shifts FROM anon;
REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.shift_assignment_locations FROM anon;

-- Grant access only to authenticated users (RLS policies will further restrict)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_private TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_assignment_locations TO authenticated;