-- Block all anonymous access on profiles_private
CREATE POLICY "Block all anon access on profiles_private"
ON public.profiles_private
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);