-- Security Advisor fix:
-- professional_registry_verifications is written by a server-side edge function only.
-- Block all direct client access so RLS is explicit and the table is not exposed.

ALTER TABLE public.professional_registry_verifications
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.professional_registry_verifications
  FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Block anon access on professional_registry_verifications"
  ON public.professional_registry_verifications;

CREATE POLICY "Block anon access on professional_registry_verifications"
ON public.professional_registry_verifications
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Block authenticated access on professional_registry_verifications"
  ON public.professional_registry_verifications;

CREATE POLICY "Block authenticated access on professional_registry_verifications"
ON public.professional_registry_verifications
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
