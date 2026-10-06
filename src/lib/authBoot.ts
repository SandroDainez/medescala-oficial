import type { Session } from '@supabase/supabase-js';

/**
 * Abertura do app: resolver a sessão sem nunca travar.
 *
 * supabase.auth.getSession() parece inofensivo, mas quando o token está vencido
 * ele tenta renovar. Sem rede, a renovação falha, segura o lock do storage e o
 * próprio getSession estoura com NavigatorLockAcquireTimeoutError depois de 10s
 * — ou simplesmente não resolve. Se quem chama só tiver .then(), o app fica em
 * "Carregando..." para sempre.
 *
 * Caso real: médico abre o app no subsolo do hospital, sem sinal, com o token
 * vencido. O app tem que abrir e dizer o que houve, não morrer na tela cinza.
 */

/** Tempo máximo de espera pela sessão na abertura. */
export const TEMPO_LIMITE_SESSAO_MS = 8000;

export type ResultadoSessaoInicial = {
  session: Session | null;
  /** true quando não deu para saber da sessão (rede caída, lock travado, erro). */
  indisponivel: boolean;
};

type ObterSessao = () => Promise<{
  data: { session: Session | null };
  error?: { message?: string } | null;
}>;

/**
 * Resolve a sessão inicial com prazo. NUNCA rejeita e NUNCA fica pendente além
 * do prazo: quem chama pode sempre desligar o "Carregando...".
 */
export async function resolverSessaoInicial(
  obterSessao: ObterSessao,
  tempoLimiteMs: number = TEMPO_LIMITE_SESSAO_MS,
): Promise<ResultadoSessaoInicial> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const prazo = new Promise<ResultadoSessaoInicial>((resolve) => {
    timer = setTimeout(() => resolve({ session: null, indisponivel: true }), tempoLimiteMs);
  });

  const tentativa = (async (): Promise<ResultadoSessaoInicial> => {
    try {
      const resultado = await obterSessao();
      const session = resultado?.data?.session ?? null;
      // Erro com sessão em mãos ainda serve; erro sem sessão é indisponibilidade.
      if (resultado?.error && !session) {
        return { session: null, indisponivel: true };
      }
      return { session, indisponivel: false };
    } catch {
      // Inclui NavigatorLockAcquireTimeoutError e falha de fetch.
      return { session: null, indisponivel: true };
    }
  })();

  try {
    return await Promise.race([tentativa, prazo]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Se o aparelho se diz offline. Usado só para explicar ao usuário o que houve —
 * nunca para bloquear uma tentativa, porque navigator.onLine mente bastante
 * (diz "online" em wi-fi de hospital sem saída para a internet).
 */
export function semConexao(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}
