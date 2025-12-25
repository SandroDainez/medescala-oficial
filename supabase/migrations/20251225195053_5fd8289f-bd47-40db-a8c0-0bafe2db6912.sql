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


-- 2. SHIFT_ASSIGNMENTS: Restringir coordenadas GPS a admins e próprio usuário
-- Criamos uma view pública sem coordenadas para membros normais, e mantemos acesso completo para admins/próprio usuário
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

-- Outros membros podem ver assignments SEM GPS (precisamos de uma abordagem diferente)
-- Como RLS não filtra colunas, criaremos uma função security definer que retorna dados sem GPS

-- Função para obter assignments do tenant sem coordenadas GPS
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
  updated_at timestamptz,
  created_by uuid,
  updated_by uuid
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
    sa.updated_at,
    sa.created_by,
    sa.updated_by
  FROM public.shift_assignments sa
  WHERE sa.tenant_id = _tenant_id
    AND public.is_tenant_member(auth.uid(), _tenant_id)
$$;

-- Para manter compatibilidade, permitimos que membros vejam dados básicos (sem GPS) via tabela
-- Mas os campos GPS só serão visíveis para admin ou próprio usuário
-- Como não podemos filtrar colunas com RLS, a aplicação deve usar a função acima para usuários normais

-- Política para membros verem assignments básicas (a app deve ocultar GPS no frontend também)
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
