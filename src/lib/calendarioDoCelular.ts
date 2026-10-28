// Parte pura da sincronização com o calendário do aparelho, separada para
// poder ser testada sem Capacitor nem Supabase.

export interface PlantaoParaCalendario {
  id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_name?: string;
}

export interface EventoDoCalendario {
  title: string;
  location?: string;
  /** O plugin chama este campo de `description`. Enviar `notes` não dá erro:
   *  o campo é simplesmente ignorado e o evento nasce sem nenhuma informação. */
  description: string;
  startDate: number;
  endDate: number;
  /** Minutos antes do início. Sem isto o evento entra mudo, e a tela promete
   *  "lembretes automáticos do celular". */
  alerts: number[];
}

export const ALERTAS_PADRAO = [-1440, -60]; // 1 dia antes e 1 hora antes

/**
 * O plugin devolve o estado por escopo ('granted' | 'denied' | 'prompt' | ...).
 * A checagem antiga era `resultado && typeof resultado === 'object'`, que dava
 * verdadeiro para QUALQUER resposta — inclusive uma negativa. O app seguia
 * adiante, a gravação falhava em silêncio e a tela anunciava sucesso.
 */
export function permissaoConcedida(estado: unknown): boolean {
  return estado === 'granted';
}

export function montarEventoDoPlantao(plantao: PlantaoParaCalendario): EventoDoCalendario {
  const inicio = new Date(`${plantao.shift_date}T${plantao.start_time}`);
  const fim = new Date(`${plantao.shift_date}T${plantao.end_time}`);

  // Plantão noturno termina no dia seguinte.
  if (fim <= inicio) {
    fim.setDate(fim.getDate() + 1);
  }

  return {
    title: `🏥 ${plantao.title}`,
    location: [plantao.hospital, plantao.location].filter(Boolean).join(' - ') || undefined,
    description: [
      plantao.sector_name ? `Setor: ${plantao.sector_name}` : '',
      plantao.hospital ? `Hospital: ${plantao.hospital}` : '',
      plantao.location || '',
      '',
      'Gerenciado pelo MedEscala',
    ].filter(Boolean).join('\n'),
    startDate: inicio.getTime(),
    endDate: fim.getTime(),
    alerts: ALERTAS_PADRAO,
  };
}

export interface ResultadoDaSincronizacao {
  criados: number;
  atualizados: number;
  removidos: number;
  falharam: number;
}

/**
 * O que dizer ao médico depois de sincronizar. A tela antiga anunciava
 * "Plantões sincronizados!" mesmo quando nada tinha sido gravado.
 */
export function mensagemDaSincronizacao(
  resultado: ResultadoDaSincronizacao,
  plantoesEnviados: number,
): { ok: boolean; texto: string } {
  if (plantoesEnviados === 0) {
    return { ok: true, texto: 'Você ainda não tem plantões futuros para adicionar ao calendário.' };
  }

  const gravados = resultado.criados + resultado.atualizados;

  if (gravados === 0) {
    return {
      ok: false,
      texto: 'Não foi possível gravar os plantões no calendário do aparelho. Confira a permissão de calendário nos ajustes do celular.',
    };
  }

  const parte = gravados === 1 ? '1 plantão adicionado' : `${gravados} plantões adicionados`;

  if (resultado.falharam > 0) {
    return {
      ok: false,
      texto: `${parte} ao calendário, mas ${resultado.falharam} ${resultado.falharam === 1 ? 'falhou' : 'falharam'}. Tente de novo pelas configurações.`,
    };
  }

  return { ok: true, texto: `${parte} ao calendário do aparelho.` };
}
