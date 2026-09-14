-- Fila de push: admin de um tenant conseguia enfileirar notificação para usuário de OUTRO
-- tenant (a política ALL não tinha WITH CHECK próprio, e user_id era livre). O destinatário
-- precisa ser membro do tenant da notificação.
DROP POLICY IF EXISTS "System can manage notification queue" ON public.push_notification_queue;
CREATE POLICY "System can manage notification queue" ON public.push_notification_queue
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), tenant_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.is_tenant_admin(auth.uid(), tenant_id)
      AND EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.tenant_id = push_notification_queue.tenant_id
          AND m.user_id = push_notification_queue.user_id
      )
    )
  );
