-- Hardening: block direct client SELECTs on profiles_private; require audited/authorized server-side access paths.
-- This addresses security scanners that flag encrypted tables as "encryption-only" by ensuring access is only via controlled server-side functions.

CREATE POLICY "Deny direct selects on profiles_private"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (false);
