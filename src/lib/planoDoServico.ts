// O plano de um serviço não é escolhido: ele acompanha o número de usuários
// ativos. Quando o serviço passa do limite da faixa, o banco migra sozinho para
// a faixa seguinte (auto_upgrade_tenant_plan) e a mensalidade passa a ser a
// dela. Estas funções existem para a tela conseguir avisar isso ANTES de
// acontecer — ninguém deve descobrir que mudou de faixa pela fatura.

export interface PlanoDisponivel {
  id: string;
  name: string;
  min_users: number;
  max_users: number;
  price_monthly?: number | string | null;
}

export const LIMITE_TESTE_GRATUITO = 3;

function ehTesteGratuito(plano: PlanoDisponivel): boolean {
  return plano.min_users === 1 && plano.max_users === LIMITE_TESTE_GRATUITO;
}

/**
 * A faixa para a qual o serviço vai quando passar do limite atual — a mesma
 * escolha que o banco faz: o menor plano que comporta um usuário a mais.
 * Devolve null quando já está na última faixa.
 */
export function proximaFaixa(
  planos: PlanoDisponivel[],
  limiteAtual: number | null | undefined,
): PlanoDisponivel | null {
  return faixaParaUsuarios(planos, Number(limiteAtual ?? 0) + 1);
}

/**
 * A faixa que comporta exatamente esta quantidade de usuários — a menor que
 * cabe. É a mesma conta do banco, e serve para mostrar quando um serviço está
 * numa faixa que não corresponde ao tamanho dele.
 */
export function faixaParaUsuarios(
  planos: PlanoDisponivel[],
  usuarios: number | null | undefined,
): PlanoDisponivel | null {
  const alvo = Math.max(1, Number(usuarios ?? 0));

  const candidatos = planos
    .filter((p) => p.max_users >= alvo)
    .filter((p) => !(alvo > LIMITE_TESTE_GRATUITO && ehTesteGratuito(p)))
    // O desempate por preço acompanha o do banco: dois planos podem ter o mesmo
    // teto, e aí o mais barato nunca pode ser servido em silêncio no lugar do
    // pago — o serviço mudaria de faixa e pararia de ser cobrado.
    .sort((a, b) => a.max_users - b.max_users || Number(b.price_monthly ?? 0) - Number(a.price_monthly ?? 0));

  return candidatos[0] ?? null;
}

export function percentualDeUso(usuarios: number | null | undefined, limite: number | null | undefined): number {
  const n = Number(usuarios ?? 0);
  const max = Number(limite ?? 0);
  if (max <= 0) return 0;
  return Math.min(100, (n / max) * 100);
}

export function vagasRestantes(usuarios: number | null | undefined, limite: number | null | undefined): number {
  return Math.max(0, Number(limite ?? 0) - Number(usuarios ?? 0));
}

export function descreverFaixa(minUsers: number, maxUsers: number): string {
  if (maxUsers >= 999999) return `${minUsers}+ usuários`;
  if (minUsers === maxUsers) return `${maxUsers} usuários`;
  return `${minUsers} a ${maxUsers} usuários`;
}
