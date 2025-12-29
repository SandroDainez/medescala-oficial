-- Add explicit SELECT policy to block anonymous access to payments
CREATE POLICY "Block anonymous select to payments"
ON public.payments
FOR SELECT
USING (false);