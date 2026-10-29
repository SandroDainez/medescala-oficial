// Envio de convite para vários profissionais de uma vez.
//
// A parte que decide QUEM recebe fica aqui, separada da tela, porque é ela que
// pode mandar e-mail para a pessoa errada — e isso não se desfaz.

export interface ProfissionalParaConvite {
  user_id: string;
  email: string | null;
  full_name: string | null;
  name: string | null;
  active: boolean;
}

export type ModoDeEnvio = 'nunca_acessaram' | 'todos';

export interface Destinatario {
  user_id: string;
  email: string;
  nome: string;
}

export interface ForaDoEnvio {
  nome: string;
  motivo: string;
}

export interface SelecaoDeConvite {
  destinatarios: Destinatario[];
  foraDoEnvio: ForaDoEnvio[];
}

function nomeDe(p: ProfissionalParaConvite): string {
  return p.full_name?.trim() || p.name?.trim() || p.email?.trim() || 'Profissional';
}

/**
 * `acessou` traz os user_id de quem já entrou no app ao menos uma vez.
 *
 * Inativo nunca recebe convite, em modo nenhum: foi desligado do serviço, e um
 * convite o traria de volta para dentro.
 */
export function selecionarDestinatarios(
  profissionais: ProfissionalParaConvite[],
  acessou: Set<string>,
  modo: ModoDeEnvio,
): SelecaoDeConvite {
  const destinatarios: Destinatario[] = [];
  const foraDoEnvio: ForaDoEnvio[] = [];
  const emailsJaIncluidos = new Set<string>();

  for (const p of profissionais) {
    const nome = nomeDe(p);
    const email = p.email?.trim().toLowerCase() ?? '';

    if (!p.active) {
      foraDoEnvio.push({ nome, motivo: 'Inativo no serviço' });
      continue;
    }

    if (!email) {
      foraDoEnvio.push({ nome, motivo: 'Sem e-mail cadastrado' });
      continue;
    }

    if (modo === 'nunca_acessaram' && acessou.has(p.user_id)) {
      foraDoEnvio.push({ nome, motivo: 'Já acessou o app' });
      continue;
    }

    // Dois cadastros com o mesmo e-mail renderiam dois convites para a mesma
    // caixa de entrada, e o segundo invalidaria o link do primeiro.
    if (emailsJaIncluidos.has(email)) {
      foraDoEnvio.push({ nome, motivo: 'E-mail repetido nesta lista' });
      continue;
    }

    emailsJaIncluidos.add(email);
    destinatarios.push({ user_id: p.user_id, email, nome });
  }

  return { destinatarios, foraDoEnvio };
}

export interface ResultadoDoEnvio {
  nome: string;
  email: string;
  enviado: boolean;
  erro?: string;
}

export function resumoDoEnvio(resultados: ResultadoDoEnvio[]): string {
  const enviados = resultados.filter((r) => r.enviado).length;
  const falhas = resultados.length - enviados;

  if (resultados.length === 0) return 'Nenhum convite para enviar.';

  const parte = enviados === 1 ? '1 convite enviado' : `${enviados} convites enviados`;
  if (falhas === 0) return `${parte}.`;

  return `${parte}, ${falhas} ${falhas === 1 ? 'falhou' : 'falharam'}.`;
}

/**
 * O provedor de e-mail recusa rajadas. Com 93 profissionais numa lista, enviar
 * em sequência sem respiro faria a maioria voltar com erro de limite — e o
 * admin veria "falhou" para gente cujo e-mail estava perfeito.
 */
export const INTERVALO_ENTRE_ENVIOS_MS = 700;

export function tempoEstimado(quantidade: number): string {
  const segundos = Math.round((quantidade * INTERVALO_ENTRE_ENVIOS_MS) / 1000);
  if (segundos < 60) return `cerca de ${segundos} segundo${segundos === 1 ? '' : 's'}`;
  const minutos = Math.round(segundos / 60);
  return `cerca de ${minutos} minuto${minutos === 1 ? '' : 's'}`;
}
