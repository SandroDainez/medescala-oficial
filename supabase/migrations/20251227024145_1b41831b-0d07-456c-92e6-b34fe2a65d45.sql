-- =====================================================
-- SECURITY HARDENING: Ensure RLS is enabled and public access is revoked
-- =====================================================

-- Ensure RLS is enabled on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Ensure RLS is enabled on profiles_private table  
ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners as well (defense in depth)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_private FORCE ROW LEVEL SECURITY;

-- Revoke all permissions from anon role on sensitive tables
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles_private FROM anon;

-- Ensure only authenticated users can access these tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_private TO authenticated;