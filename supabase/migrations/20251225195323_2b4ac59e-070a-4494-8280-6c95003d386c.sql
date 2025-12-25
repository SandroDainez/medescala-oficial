-- Adicionar política para admins visualizarem pagamentos do tenant
CREATE POLICY "Tenant admins can view payments"
ON public.payments
FOR SELECT
USING (auth.uid() IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));