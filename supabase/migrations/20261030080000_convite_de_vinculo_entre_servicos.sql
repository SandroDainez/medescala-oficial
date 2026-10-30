-- Aproveitar a conta que o médico já tem em outro serviço, sem que um admin
-- possa tomá-la.
--
-- Vincular direto uma conta existente permitia a qualquer admin (inclusive de
-- um serviço recém-criado no cadastro gratuito) anexar o e-mail de um colega e,
-- pelo botão de convite, redefinir a senha dele e ler seus dados nos outros
-- serviços. Por isso create-user passou a recusar esses e-mails.
--
-- Aqui o vínculo deixa de ser um ato do admin e passa a ser um convite: a
-- coordenação registra o pedido, e só o próprio dono da conta, autenticado,
-- transforma isso em membership.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome_sugerido text NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aceito', 'recusado', 'cancelado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id),
  decided_at timestamptz NULL,
  decided_by uuid NULL REFERENCES auth.users(id)
);

-- Um convite pendente por pessoa e serviço: reenviar não empilha pedidos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_join_requests_pendente_unico
  ON public.tenant_join_requests (tenant_id, user_id)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_tenant_join_requests_usuario
  ON public.tenant_join_requests (user_id, status);

ALTER TABLE public.tenant_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_join_requests FORCE ROW LEVEL SECURITY;

-- Nada de leitura ou escrita direta: a tabela diz em que serviços um e-mail
-- tem conta. Só as funções abaixo tocam nela.
DROP POLICY IF EXISTS "Block anon access on tenant_join_requests" ON public.tenant_join_requests;
CREATE POLICY "Block anon access on tenant_join_requests"
ON public.tenant_join_requests AS RESTRICTIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Block authenticated direct access on tenant_join_requests" ON public.tenant_join_requests;
CREATE POLICY "Block authenticated direct access on tenant_join_requests"
ON public.tenant_join_requests AS RESTRICTIVE FOR ALL TO authenticated
USING (false) WITH CHECK (false);

GRANT ALL ON TABLE public.tenant_join_requests TO service_role;

-- O que o dono da conta vê ao abrir o app.
CREATE OR REPLACE FUNCTION public.listar_meus_convites_de_servico()
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  tenant_nome text,
  role public.app_role,
  criado_em timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.tenant_id, t.name, c.role, c.created_at
  FROM public.tenant_join_requests c
  JOIN public.tenants t ON t.id = c.tenant_id
  WHERE c.user_id = auth.uid()
    AND c.status = 'pendente'
  ORDER BY c.created_at;
$function$;

GRANT EXECUTE ON FUNCTION public.listar_meus_convites_de_servico() TO authenticated;

-- Aceitar é o único caminho que cria o vínculo. Quem decide é o dono da conta:
-- a função não aceita um id de outra pessoa.
CREATE OR REPLACE FUNCTION public.responder_convite_de_servico(
  _convite_id uuid,
  _aceitar boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_convite public.tenant_join_requests;
BEGIN
  SELECT * INTO v_convite
  FROM public.tenant_join_requests
  WHERE id = _convite_id
    AND user_id = auth.uid()
    AND status = 'pendente'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite não encontrado ou já respondido.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF _aceitar THEN
    INSERT INTO public.memberships (tenant_id, user_id, role, active, created_by, updated_by)
    VALUES (v_convite.tenant_id, auth.uid(), v_convite.role, true, auth.uid(), auth.uid())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET active = true,
          role = EXCLUDED.role,
          updated_by = auth.uid(),
          updated_at = now();
  END IF;

  UPDATE public.tenant_join_requests
  SET status = CASE WHEN _aceitar THEN 'aceito' ELSE 'recusado' END,
      decided_at = now(),
      decided_by = auth.uid()
  WHERE id = v_convite.id;

  RETURN CASE WHEN _aceitar THEN 'aceito' ELSE 'recusado' END;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.responder_convite_de_servico(uuid, boolean) TO authenticated;

-- O que a coordenação vê enquanto espera.
CREATE OR REPLACE FUNCTION public.listar_convites_do_servico(_tenant_id uuid)
RETURNS TABLE(
  id uuid,
  email text,
  nome_sugerido text,
  role public.app_role,
  criado_em timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.email, c.nome_sugerido, c.role, c.created_at
  FROM public.tenant_join_requests c
  WHERE c.tenant_id = _tenant_id
    AND c.status = 'pendente'
    AND (
      public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    )
  ORDER BY c.created_at;
$function$;

GRANT EXECUTE ON FUNCTION public.listar_convites_do_servico(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_convite_de_servico(_convite_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_linhas integer;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_join_requests
  WHERE id = _convite_id AND status = 'pendente';

  IF v_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (public.is_tenant_admin(auth.uid(), v_tenant_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Apenas a coordenação do serviço pode cancelar o convite.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.tenant_join_requests
  SET status = 'cancelado',
      decided_at = now(),
      decided_by = auth.uid()
  WHERE id = _convite_id AND status = 'pendente';

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancelar_convite_de_servico(uuid) TO authenticated;

COMMIT;
