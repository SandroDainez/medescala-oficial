
-- ============================================================
-- MIGRAÇÃO: Visibilidade de Escalas por Setor + Gestão Admin
-- Requisitos:
-- 1. Usuários veem TODAS escalas do setor (mesmo não escalados)
-- 2. Admins gerenciam usuários/escalas sem PII temporal grant
-- ============================================================

-- ===========================================
-- 1. SHIFT_ASSIGNMENTS - Visibilidade por Setor
-- ===========================================
-- Remover policy restritiva atual
DROP POLICY IF EXISTS "Users can view authorized shift assignments" ON public.shift_assignments;

-- Nova policy: Ver todas atribuições do setor ou próprias
CREATE POLICY "Users can view shift assignments in their sectors"
ON public.shift_assignments
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- Admin/Super pode ver tudo do tenant
    is_tenant_admin(auth.uid(), tenant_id)
    OR is_super_admin(auth.uid())
    OR has_gabs_bypass(auth.uid())
    -- Própria atribuição
    OR user_id = auth.uid()
    -- Membro do mesmo setor (via shift)
    OR EXISTS (
      SELECT 1
      FROM public.shifts s
      INNER JOIN public.sector_memberships sm 
        ON sm.sector_id = s.sector_id 
        AND sm.tenant_id = s.tenant_id
      WHERE s.id = shift_assignments.shift_id
        AND sm.user_id = auth.uid()
    )
  )
);

-- ===========================================
-- 2. SHIFT_ENTRIES - Visibilidade por Setor
-- ===========================================
DROP POLICY IF EXISTS "Users can view their own shift entries" ON public.shift_entries;

CREATE POLICY "Users can view shift entries in their sectors"
ON public.shift_entries
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id)
  AND (
    -- Admin pode ver tudo
    is_tenant_admin(auth.uid(), tenant_id)
    OR is_super_admin(auth.uid())
    -- Própria entrada
    OR plantonista_id = auth.uid()
    -- Membro do setor
    OR EXISTS (
      SELECT 1
      FROM public.sector_memberships sm
      WHERE sm.sector_id = shift_entries.setor_id
        AND sm.tenant_id = shift_entries.tenant_id
        AND sm.user_id = auth.uid()
    )
  )
);

-- ===========================================
-- 3. PROFILES - Admin pode ver/editar todos do tenant
-- ===========================================
-- Atualizar função can_view_profile para incluir colegas de tenant
CREATE OR REPLACE FUNCTION public.can_view_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Próprio perfil
    auth.uid() = _profile_id
    -- Ou super admin / GABS bypass
    OR is_super_admin(auth.uid())
    OR has_gabs_bypass(auth.uid())
    -- Ou compartilha ao menos um tenant ativo
    OR EXISTS (
      SELECT 1
      FROM public.memberships my_m
      INNER JOIN public.memberships their_m 
        ON their_m.tenant_id = my_m.tenant_id
      WHERE my_m.user_id = auth.uid()
        AND my_m.active = true
        AND their_m.user_id = _profile_id
        AND their_m.active = true
    )
  )
$$;

-- Atualizar função can_admin_access_profile
CREATE OR REPLACE FUNCTION public.can_admin_access_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships admin_m
    INNER JOIN public.memberships target_m 
      ON target_m.tenant_id = admin_m.tenant_id
    WHERE admin_m.user_id = auth.uid()
      AND admin_m.active = true
      AND admin_m.role = 'admin'
      AND target_m.user_id = _profile_id
  )
  OR is_super_admin(auth.uid())
$$;

-- ===========================================
-- 4. PROFILES_PRIVATE - Admin pode gerenciar sem PII grant temporal
-- (Necessário para operações normais de RH/admin)
-- ===========================================
-- Remover policies antigas que exigem PII temporal
DROP POLICY IF EXISTS "PII access requires explicit grant or ownership" ON public.profiles_private;
DROP POLICY IF EXISTS "Deny direct selects on profiles_private" ON public.profiles_private;

-- Nova policy: Owner OU Admin do tenant podem SELECT
CREATE POLICY "Owner or tenant admin can view profiles_private"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND (
    -- Próprio perfil
    (auth.uid() = user_id AND is_tenant_member(auth.uid(), tenant_id))
    -- Admin do tenant pode ver
    OR is_tenant_admin(auth.uid(), tenant_id)
    -- Super admin
    OR is_super_admin(auth.uid())
  )
);

-- Nova policy: Admin pode UPDATE profiles_private do tenant
DROP POLICY IF EXISTS "Owner can update own private profile" ON public.profiles_private;

CREATE POLICY "Owner or tenant admin can update profiles_private"
ON public.profiles_private
FOR UPDATE
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND (
    (auth.uid() = user_id AND is_tenant_member(auth.uid(), tenant_id))
    OR is_tenant_admin(auth.uid(), tenant_id)
    OR is_super_admin(auth.uid())
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND (
    (auth.uid() = user_id AND is_tenant_member(auth.uid(), tenant_id))
    OR is_tenant_admin(auth.uid(), tenant_id)
    OR is_super_admin(auth.uid())
  )
);

-- Nova policy: Admin pode INSERT profiles_private para usuários do tenant
DROP POLICY IF EXISTS "Owner can insert own private profile" ON public.profiles_private;

CREATE POLICY "Owner or tenant admin can insert profiles_private"
ON public.profiles_private
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IS NOT NULL
  AND (
    (auth.uid() = user_id AND is_tenant_member(auth.uid(), tenant_id))
    OR is_tenant_admin(auth.uid(), tenant_id)
    OR is_super_admin(auth.uid())
  )
);

-- ===========================================
-- 5. Comentário documentando regras
-- ===========================================
COMMENT ON TABLE public.shift_assignments IS 
'Atribuições de plantão. RLS: Membros do setor podem ver todas atribuições do setor. Admins gerenciam tudo.';

COMMENT ON TABLE public.profiles_private IS 
'Dados sensíveis criptografados. RLS: Owner e Admin do tenant podem ver/editar. Dados criptografados com AES-256-GCM.';
