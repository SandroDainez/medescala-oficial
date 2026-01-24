-- Drop duplicate/overlapping anonymous block policies on payments table
DROP POLICY IF EXISTS "Block all anonymous access to payments" ON public.payments;
DROP POLICY IF EXISTS "Block anonymous inserts to payments" ON public.payments;
DROP POLICY IF EXISTS "Block anonymous select on payments" ON public.payments;
DROP POLICY IF EXISTS "Block anonymous select to payments" ON public.payments;

-- Keep only one comprehensive restrictive policy for anon
-- The existing "Block all anon access on payments" already handles this