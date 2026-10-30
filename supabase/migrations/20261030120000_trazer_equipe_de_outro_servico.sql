-- Montar um serviço novo com a equipe que já existe em outro serviço do mesmo
-- coordenador, sem digitar e-mail por e-mail.
--
-- A permissão é estreita de propósito: só serviços em que QUEM PEDE é
-- administrador. Assim nenhum e-mail novo aparece para ele — são pessoas que
-- ele já enxerga hoje. Nada aqui revela quem tem conta no MedEscala.
--
-- Quem já usa o app entra por convite (aceita no app, como qualquer vínculo
-- entre serviços). Quem nunca acessou entra direto: a conta ainda não tem dono
-- de fato, e quem pede já administra os dois lados — não ganha nenhum acesso
-- que já não tivesse.

BEGIN;

CREATE OR REPLACE FUNCTION public.administra_servico(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(auth.uid())
     OR EXISTS (
       SELECT 1 FROM public.memberships m
       WHERE m.user_id = auth.uid()
         AND m.tenant_id = _tenant_id
         AND m.role IN ('admin', 'owner')
         AND m.active
     );
$function$;

GRANT EXECUTE ON FUNCTION public.administra_servico(uuid) TO authenticated;

-- De onde dá para trazer gente.
CREATE OR REPLACE FUNCTION public.listar_servicos_que_administro()
RETURNS TABLE(tenant_id uuid, nome text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name
  FROM public.tenants t
  WHERE public.administra_servico(t.id)
  ORDER BY t.name;
$function$;

GRANT EXECUTE ON FUNCTION public.listar_servicos_que_administro() TO authenticated;

-- A equipe do serviço de origem, já dizendo quem não cabe mais na seleção.
CREATE OR REPLACE FUNCTION public.listar_equipe_para_convidar(_origem uuid, _destino uuid)
RETURNS TABLE(
  user_id uuid,
  nome text,
  email text,
  nunca_acessou boolean,
  situacao text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    m.user_id,
    COALESCE(NULLIF(p.full_name, ''), NULLIF(p.name, ''), p.email) AS nome,
    p.email,
    u.last_sign_in_at IS NULL AS nunca_acessou,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.memberships d
        WHERE d.tenant_id = _destino AND d.user_id = m.user_id AND d.active
      ) THEN 'ja_no_servico'
      WHEN EXISTS (
        SELECT 1 FROM public.tenant_join_requests c
        WHERE c.tenant_id = _destino AND c.user_id = m.user_id AND c.status = 'pendente'
      ) THEN 'convite_pendente'
      ELSE 'disponivel'
    END AS situacao
  FROM public.memberships m
  JOIN public.profiles p ON p.id = m.user_id
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.tenant_id = _origem
    AND m.active
    AND _origem <> _destino
    AND public.administra_servico(_origem)
    AND public.administra_servico(_destino)
  ORDER BY 2;
$function$;

GRANT EXECUTE ON FUNCTION public.listar_equipe_para_convidar(uuid, uuid) TO authenticated;

-- A coluna de saida nao pode se chamar user_id: colide com a coluna das
-- tabelas dentro do INSERT ... ON CONFLICT e o Postgres recusa a chamada.
DROP FUNCTION IF EXISTS public.convidar_equipe(uuid, uuid, uuid[]);

CREATE FUNCTION public.convidar_equipe(
  _origem uuid,
  _destino uuid,
  _user_ids uuid[]
)
RETURNS TABLE(pessoa uuid, resultado text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_nunca_acessou boolean;
  v_email text;
  v_nome text;
BEGIN
  IF _origem = _destino THEN
    RAISE EXCEPTION 'Origem e destino são o mesmo serviço.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT (public.administra_servico(_origem) AND public.administra_servico(_destino)) THEN
    RAISE EXCEPTION 'Você precisa administrar os dois serviços.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(_user_ids, ARRAY[]::uuid[]) LOOP
    -- Só quem é membro ativo da origem: a lista da tela não é a autorização.
    SELECT u.last_sign_in_at IS NULL, p.email, COALESCE(NULLIF(p.full_name, ''), NULLIF(p.name, ''), p.email)
      INTO v_nunca_acessou, v_email, v_nome
    FROM public.memberships m
    JOIN public.profiles p ON p.id = m.user_id
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.tenant_id = _origem AND m.user_id = v_id AND m.active;

    IF NOT FOUND THEN
      pessoa := v_id; resultado := 'fora_da_origem'; RETURN NEXT; CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.memberships d
      WHERE d.tenant_id = _destino AND d.user_id = v_id AND d.active
    ) THEN
      pessoa := v_id; resultado := 'ja_no_servico'; RETURN NEXT; CONTINUE;
    END IF;

    IF v_nunca_acessou THEN
      INSERT INTO public.memberships (tenant_id, user_id, role, active, created_by, updated_by)
      VALUES (_destino, v_id, 'user', true, auth.uid(), auth.uid())
      ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET active = true, updated_by = auth.uid(), updated_at = now();

      pessoa := v_id; resultado := 'adicionado'; RETURN NEXT;
    ELSE
      INSERT INTO public.tenant_join_requests (tenant_id, user_id, email, nome_sugerido, role, created_by)
      VALUES (_destino, v_id, v_email, v_nome, 'user', auth.uid())
      ON CONFLICT (tenant_id, user_id) WHERE status = 'pendente' DO NOTHING;

      pessoa := v_id; resultado := 'convidado'; RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.convidar_equipe(uuid, uuid, uuid[]) TO authenticated;

COMMIT;
