-- =====================================================
-- SECURITY HARDENING: profiles_private, shifts, payments
-- Não altera regras funcionais de visibilidade por setor/admin
-- =====================================================

-- 1) profiles_private: Adicionar NOT NULL constraint em tenant_id
-- Isso garante que RLS nunca seja bypassado por valores nulos
ALTER TABLE public.profiles_private 
ALTER COLUMN tenant_id SET NOT NULL;

-- 2) shifts: Remover políticas redundantes que são cobertas pela política principal
-- A política "Users can view shifts in their sectors or assigned to them" já cobre tudo
DROP POLICY IF EXISTS "Members can view tenant shifts" ON public.shifts;
DROP POLICY IF EXISTS "Authenticated users can view shifts" ON public.shifts;

-- 3) payments: Remover política redundante de autenticação genérica
-- As políticas específicas (Finance can view, Users can view own) já cobrem o acesso
DROP POLICY IF EXISTS "Authenticated users can view payments" ON public.payments;

-- 4) Documentação via COMMENT
COMMENT ON TABLE public.profiles_private IS 
'Dados PII criptografados. tenant_id obrigatório para RLS. Acesso via edge function pii-crypto.';

COMMENT ON TABLE public.shifts IS 
'Plantões. Visibilidade: admin do tenant, membro do setor, ou escalado no plantão.';

COMMENT ON TABLE public.payments IS 
'Pagamentos. Visibilidade: próprio usuário ou finance com grant temporal.';