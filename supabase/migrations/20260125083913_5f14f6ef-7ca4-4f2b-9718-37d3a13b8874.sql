-- ============================================================
-- 1) PROFILES: Restringir visibilidade
-- Usuário vê apenas o próprio perfil OU admin vê todos do tenant
-- ============================================================

-- Remover política atual permissiva
DROP POLICY IF EXISTS "Tenant members can view profiles in their tenant" ON public.profiles;

-- Nova política: usuário vê apenas o próprio perfil
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = id
);

-- Nova política: admins veem perfis de membros do mesmo tenant
CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1
    FROM public.memberships admin_m
    WHERE admin_m.user_id = auth.uid()
      AND admin_m.role = 'admin'
      AND admin_m.active = true
      AND EXISTS (
        SELECT 1
        FROM public.memberships target_m
        WHERE target_m.user_id = profiles.id
          AND target_m.tenant_id = admin_m.tenant_id
          AND target_m.active = true
      )
  )
);

-- ============================================================
-- 2) SHIFT_ASSIGNMENT_LOCATIONS: Limitar acesso temporal
-- Usuários veem apenas últimos 30 dias; admins veem tudo
-- ============================================================

-- Remover política atual de SELECT do usuário
DROP POLICY IF EXISTS "Users can view their own assignment locations" ON public.shift_assignment_locations;

-- Nova política: usuário vê apenas os próprios dados dos últimos 30 dias
CREATE POLICY "Users can view own recent locations (30 days)"
ON public.shift_assignment_locations
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND user_id = auth.uid() 
  AND is_tenant_member(auth.uid(), tenant_id)
  AND created_at >= (now() - interval '30 days')
);

-- Admins já têm acesso via política existente "Tenant admins can manage assignment locations"
-- mas vamos garantir que SELECT ilimitado funcione para eles
DROP POLICY IF EXISTS "Tenant admins can view all locations" ON public.shift_assignment_locations;

CREATE POLICY "Tenant admins can view all locations"
ON public.shift_assignment_locations
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND tenant_id IS NOT NULL 
  AND is_tenant_admin(auth.uid(), tenant_id)
);

-- ============================================================
-- 3) VIEW SEGURA para GPS (opcional, para queries sem RLS bypass)
-- ============================================================

-- View que aplica as regras de negócio diretamente
CREATE OR REPLACE VIEW public.shift_assignment_locations_secure
WITH (security_invoker = true) AS
SELECT 
  sal.assignment_id,
  sal.user_id,
  sal.tenant_id,
  sal.checkin_latitude,
  sal.checkin_longitude,
  sal.checkout_latitude,
  sal.checkout_longitude,
  sal.created_at,
  sal.updated_at
FROM public.shift_assignment_locations sal
WHERE 
  -- Admins veem tudo do tenant
  (is_tenant_admin(auth.uid(), sal.tenant_id))
  OR
  -- Usuários veem apenas os próprios dados dos últimos 30 dias
  (
    sal.user_id = auth.uid() 
    AND is_tenant_member(auth.uid(), sal.tenant_id)
    AND sal.created_at >= (now() - interval '30 days')
  );