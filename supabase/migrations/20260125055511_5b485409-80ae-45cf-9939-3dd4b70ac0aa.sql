
-- Fix remaining tables: profiles_private (auth requirement) and plans

-- 6) PROFILES_PRIVATE - Add auth requirement (drop first if exists)
DROP POLICY IF EXISTS "Require authentication for profiles_private" ON public.profiles_private;

CREATE POLICY "Require authentication for profiles_private"
ON public.profiles_private
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 7) PLANS - Block anon + restrict to authenticated
DROP POLICY IF EXISTS "Block all anon access on plans" ON public.plans;
DROP POLICY IF EXISTS "Authenticated users can view active plans" ON public.plans;

CREATE POLICY "Block all anon access on plans"
ON public.plans
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Authenticated users can view active plans"
ON public.plans
AS PERMISSIVE
FOR SELECT
TO authenticated
USING ((auth.uid() IS NOT NULL) AND (active = true));
