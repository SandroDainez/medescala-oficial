-- Harden RLS role scoping (anon vs authenticated) and remove redundant policies

-- =========================
-- PAYMENTS
-- =========================
-- Ensure anon is explicitly blocked (scanner-friendly)
ALTER POLICY "Block all anon access on payments" ON public.payments TO anon;

-- Ensure all other policies are authenticated-only
ALTER POLICY "Tenant admin can view all tenant payments" ON public.payments TO authenticated;
ALTER POLICY "Users can view own payments" ON public.payments TO authenticated;
ALTER POLICY "Tenant admin can insert payments" ON public.payments TO authenticated;
ALTER POLICY "Tenant admin can update payments" ON public.payments TO authenticated;
ALTER POLICY "Tenant admin can delete payments" ON public.payments TO authenticated;

-- =========================
-- PROFILES
-- =========================
-- Consolidate anon blocking to a single restrictive policy scoped to anon
DROP POLICY IF EXISTS "Block anon inserts on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Block anon updates on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Block anonymous select on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Deny anon select" ON public.profiles;
DROP POLICY IF EXISTS "No anon deletes to profiles" ON public.profiles;

-- Keep the existing "Block all anon access on profiles" but scope it to anon explicitly
ALTER POLICY "Block all anon access on profiles" ON public.profiles TO anon;

-- Make all permissive policies explicitly authenticated-only
ALTER POLICY "Owner can view own profile" ON public.profiles TO authenticated;
ALTER POLICY "Owner can insert own profile" ON public.profiles TO authenticated;
ALTER POLICY "Owner can update own profile" ON public.profiles TO authenticated;
ALTER POLICY "No client deletes to profiles" ON public.profiles TO authenticated;
ALTER POLICY "Tenant admin can view profile in their tenant" ON public.profiles TO authenticated;
ALTER POLICY "Tenant admin can update profile in their tenant" ON public.profiles TO authenticated;
ALTER POLICY "Tenant members can view profiles in their tenant" ON public.profiles TO authenticated;

-- =========================
-- SHIFTS
-- =========================
-- Remove redundant anon-deny policy (keep one clear anon blocker)
DROP POLICY IF EXISTS "Deny anon select" ON public.shifts;

-- Scope anon blocker to anon explicitly
ALTER POLICY "Block all anon access on shifts" ON public.shifts TO anon;

-- Ensure business policies only apply to authenticated
ALTER POLICY "Tenant admins can manage shifts" ON public.shifts TO authenticated;
ALTER POLICY "Users can view shifts in their sectors" ON public.shifts TO authenticated;

-- =========================
-- SHIFT_ASSIGNMENT_LOCATIONS
-- =========================
-- Remove redundant/overlapping anonymous policies (keep one)
DROP POLICY IF EXISTS "Block all anonymous access to shift_assignment_locations" ON public.shift_assignment_locations;
DROP POLICY IF EXISTS "Block anonymous inserts to shift_assignment_locations" ON public.shift_assignment_locations;
DROP POLICY IF EXISTS "Block anonymous select on shift_assignment_locations" ON public.shift_assignment_locations;

-- Scope remaining anon blocker to anon explicitly
ALTER POLICY "Block all anon access on shift_assignment_locations" ON public.shift_assignment_locations TO anon;

-- Ensure other policies are authenticated-only
ALTER POLICY "Tenant admins can manage assignment locations" ON public.shift_assignment_locations TO authenticated;
ALTER POLICY "Admins can delete assignment locations" ON public.shift_assignment_locations TO authenticated;
ALTER POLICY "Users can insert own assignment locations" ON public.shift_assignment_locations TO authenticated;
ALTER POLICY "Users can update their own assignment locations" ON public.shift_assignment_locations TO authenticated;
ALTER POLICY "Users can view their own assignment locations" ON public.shift_assignment_locations TO authenticated;
