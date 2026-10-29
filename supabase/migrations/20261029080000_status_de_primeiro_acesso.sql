-- Quem do serviço ainda não entrou no app nenhuma vez.
--
-- O convite é um link de primeiro acesso: mandar para quem já usa o aplicativo
-- é ruído, e ainda parece pedido de troca de senha que ninguém fez. Sem este
-- dado a tela não tem como separar os dois grupos — `auth.users` não é visível
-- do navegador.
--
-- Devolve só o necessário para decidir o envio: nenhum dado novo sobre a
-- pessoa, apenas se e quando ela entrou.
CREATE OR REPLACE FUNCTION public.listar_status_de_acesso(_tenant_id uuid)
RETURNS TABLE(user_id uuid, nunca_acessou boolean, ultimo_acesso timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    m.user_id,
    u.last_sign_in_at IS NULL AS nunca_acessou,
    u.last_sign_in_at AS ultimo_acesso
  FROM public.memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.tenant_id = _tenant_id
    AND (
      public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    );
$function$;

GRANT EXECUTE ON FUNCTION public.listar_status_de_acesso(uuid) TO authenticated;
