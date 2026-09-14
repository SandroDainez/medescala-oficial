-- Isolamento multi-tenant — correções encontradas em auditoria (2026-09-14), provadas por
-- simulação em transação desfeita: um admin de um tenant recém-criado pelo cadastro
-- gratuito lia e alterava TODAS as memberships de outro tenant e conseguia mover a
-- própria membership para o tenant alheio como admin (escalada completa).

-- 1) memberships: "admin" deve ser admin DO TENANT da linha, não de qualquer tenant.
--    is_admin() retornava true para admin de qualquer tenant (sem filtro de tenant nem active).
DROP POLICY IF EXISTS memberships_admin_or_self ON public.memberships;
CREATE POLICY memberships_admin_or_self ON public.memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_tenant_admin(auth.uid(), tenant_id)
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS memberships_admin_update ON public.memberships;
CREATE POLICY memberships_admin_update ON public.memberships
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR public.is_super_admin(auth.uid())
  )
  -- WITH CHECK avalia a linha NOVA: impede mover a membership para um tenant onde
  -- o usuário não é admin.
  WITH CHECK (
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR public.is_super_admin(auth.uid())
  );

-- Sem uso após a troca acima; removida para não ser reutilizada por engano.
DROP FUNCTION IF EXISTS public.is_admin();

-- 2) auto_upgrade_tenant_plan: qualquer usuário autenticado alterava o plano de qualquer
--    tenant. Só é chamada internamente (can_add_user_to_tenant, update_tenant_user_count,
--    ambas SECURITY DEFINER), então não precisa de EXECUTE para clientes.
REVOKE EXECUTE ON FUNCTION public.auto_upgrade_tenant_plan(uuid, integer) FROM PUBLIC, anon, authenticated;

-- 3) resolve_assignment_snapshot_value (4 args): versão antiga, sem checagem de chamador,
--    executável até por anon (revelava valor de plantão de qualquer tenant). A versão de
--    5 args (com checagens) é a usada por create_assignment_with_snapshot.
DROP FUNCTION IF EXISTS public.resolve_assignment_snapshot_value(uuid, uuid, uuid, numeric);

-- 4) tenants: criação só pelos fluxos oficiais (create_tenant_with_admin /
--    super_admin_create_tenant, SECURITY DEFINER). O INSERT direto pulava plano/limites.
DROP POLICY IF EXISTS "Authenticated users can create tenants" ON public.tenants;

-- 5) cleanup_old_notifications: apagava notificações antigas de TODOS os tenants se chamada
--    por qualquer usuário. Manutenção é interna.
REVOKE EXECUTE ON FUNCTION public.cleanup_old_notifications() FROM PUBLIC, anon, authenticated;
