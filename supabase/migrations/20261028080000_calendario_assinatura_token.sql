-- Endereço secreto da escala, para o celular assinar o calendário.
--
-- O aparelho consulta esse endereço sozinho, de madrugada, sem ninguém por
-- perto: ele não tem como fazer login. Por isso o próprio endereço é a
-- credencial — longo, aleatório e revogável a qualquer momento.
--
-- O token fica em texto porque o que ele protege (os plantões) está nesta
-- mesma base: guardar só o resumo criptográfico não protegeria nada a mais, e
-- impediria o médico de rever o próprio endereço para assinar num segundo
-- aparelho. Quem defende a linha é a RLS abaixo.
CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  last_accessed_at timestamptz
);

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

-- Só o dono lê o próprio endereço. Escrita acontece apenas pelas funções
-- SECURITY DEFINER abaixo, e a leitura por token é feita pela Edge Function
-- com a chave de serviço.
DROP POLICY IF EXISTS calendar_feed_tokens_select_own ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_select_own ON public.calendar_feed_tokens
  FOR SELECT USING (user_id = auth.uid());

-- 64 caracteres hexadecimais = 256 bits de aleatoriedade. Não depende de
-- extensão nenhuma do Postgres.
CREATE OR REPLACE FUNCTION public.gerar_token_de_calendario()
RETURNS text
LANGUAGE sql
VOLATILE
AS $function$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$function$;

-- Devolve o endereço do médico, criando na primeira vez.
CREATE OR REPLACE FUNCTION public.obter_token_de_calendario()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT token INTO v_token FROM public.calendar_feed_tokens WHERE user_id = auth.uid();

  IF v_token IS NULL THEN
    v_token := public.gerar_token_de_calendario();
    INSERT INTO public.calendar_feed_tokens (user_id, token)
    VALUES (auth.uid(), v_token)
    ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token
    RETURNING token INTO v_token;
  END IF;

  RETURN v_token;
END;
$function$;

-- Revogar: o endereço antigo morre na hora e nasce outro.
CREATE OR REPLACE FUNCTION public.girar_token_de_calendario()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_token := public.gerar_token_de_calendario();

  INSERT INTO public.calendar_feed_tokens (user_id, token, rotated_at)
  VALUES (auth.uid(), v_token, now())
  ON CONFLICT (user_id) DO UPDATE
    SET token = EXCLUDED.token,
        rotated_at = now(),
        last_accessed_at = NULL;

  RETURN v_token;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gerar_token_de_calendario() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_token_de_calendario() TO authenticated;
GRANT EXECUTE ON FUNCTION public.girar_token_de_calendario() TO authenticated;
