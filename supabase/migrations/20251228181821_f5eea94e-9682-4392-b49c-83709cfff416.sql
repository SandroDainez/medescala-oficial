-- Explicitly deny DELETE on profiles from the client (defense-in-depth)

DROP POLICY IF EXISTS "No client deletes to profiles" ON public.profiles;
CREATE POLICY "No client deletes to profiles"
ON public.profiles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (false);

-- Also deny anon deletes explicitly (should already be blocked)
DROP POLICY IF EXISTS "No anon deletes to profiles" ON public.profiles;
CREATE POLICY "No anon deletes to profiles"
ON public.profiles
AS RESTRICTIVE
FOR DELETE
TO anon
USING (false);