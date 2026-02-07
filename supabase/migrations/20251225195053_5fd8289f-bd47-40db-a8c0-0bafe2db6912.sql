-- 1. PAYMENTS: Somente o próprio usuário pode ver seus pagamentos (admin NÃO vê mais)
DROP POLICY IF EXISTS "Tenant admins can manage all payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view their payments in tenant" ON public.payments;

-- Admins ainda podem criar/atualizar/deletar pagamentos (gestão), mas NÃO VER todos
CREATE POLICY "Tenant admins can insert payments"
ON public.payments
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can update payments"
ON public.payments
FOR UPDATE
USING (auth.uid() IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can delete payments"
ON public.payments
FOR DELETE
USING (auth.uid() IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));

-- Somente o próprio usuário pode VER seus pagamentos
CREATE POLICY "Users can view their own payments"
ON public.payments
FOR SELECT
USING (auth.uid() IS NOT NULL AND user_id = auth.uid());


-------------------------------------------------------
-- SHIFT_ASSIGNMENTS: GPS apenas para admin / próprio user
-------------------------------------------------------

-- Primeiro, removemos a política atual de SELECT para membros
DROP POLICY IF EXISTS "Tenant members can view all assignments in tenant" ON public.shift_assignments;

-- Admins veem tudo
CREATE POLICY "Tenant admins can view all shift assignments"
ON public.shift_assignments
FOR SELECT
USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- Usuário vê suas próprias assignments (com GPS)
CREATE POLICY "Users can view their own shift assignments"
ON public.shift_assignments
FOR SELECT
USING (auth.uid() IS NOT NULL AND user_id = auth.uid());


-------------------------------------------------------
-- Função SEM created_by / updated_by (ainda não existem aqui)
-------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_shift_assignments_without_gps(_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  shift_id uuid,
  user_id uuid,
  tenant_id uuid,
  status text,
  assigned_value numeric,
  notes text,
  checkin_at timestamptz,
  checkout_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sa.id,
    sa.shift_id,
    sa.user_id,
    sa.tenant_id,
    sa.status,
    sa.assigned_value,
    sa.notes,
    sa.checkin_at,
    sa.checkout_at,
    sa.created_at,
    sa.updated_at
  FROM public.shift_assignments sa
  WHERE sa.tenant_id = _tenant_id
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;


-------------------------------------------------------
-- Política para membros verem assignments básicas
-------------------------------------------------------

CREATE POLICY "Tenant members can view basic shift assignments"
ON public.shift_assignments
FOR SELECT
USING (
  public.is_tenant_member(auth.uid(), tenant_id)
  AND (
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR user_id = auth.uid()
  )
);

