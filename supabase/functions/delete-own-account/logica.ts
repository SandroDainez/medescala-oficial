/**
 * Decisões puras do encerramento de conta, separadas do index.ts para poderem
 * ser testadas sem subir servidor nem tocar no banco.
 */

export type AtribuicaoBruta = {
  id: string
  tenant_id: string
  shifts?: {
    shift_date?: string | null
    title?: string | null
    start_time?: string | null
    end_time?: string | null
    sector_id?: string | null
  } | null
}

export type PlantaoFuturo = {
  assignmentId: string
  tenantId: string
  shiftDate: string
  title: string
  startTime: string | null
  endTime: string | null
  sectorId: string | null
}

/**
 * Hoje no fuso de Brasília, como 'YYYY-MM-DD'.
 *
 * shifts.shift_date é DATE (sem fuso). Comparar com current_date do servidor (UTC)
 * erra o plantão de hoje a partir das 21h de Brasília, quando em UTC já é amanhã:
 * o plantão desta noite seria tratado como passado e NÃO seria liberado.
 */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD.
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Separa o que já foi trabalhado do que ainda vai acontecer.
 *
 * O plantão de hoje conta como FUTURO: ainda vai ser cumprido (ou não), então
 * precisa virar vaga aberta para alguém cobrir.
 */
export function separarPlantoes(
  atribuicoes: AtribuicaoBruta[],
  hoje: string,
): { futuros: PlantaoFuturo[]; passados: number } {
  const futuros: PlantaoFuturo[] = []
  let passados = 0

  for (const a of atribuicoes ?? []) {
    const s = a.shifts
    if (!s?.shift_date) continue // sem data não dá para decidir: não mexe

    if (s.shift_date >= hoje) {
      futuros.push({
        assignmentId: a.id,
        tenantId: a.tenant_id,
        shiftDate: s.shift_date,
        title: s.title ?? 'Plantão',
        startTime: s.start_time ?? null,
        endTime: s.end_time ?? null,
        sectorId: s.sector_id ?? null,
      })
    } else {
      passados += 1
    }
  }

  futuros.sort((a, b) => (a.shiftDate < b.shiftDate ? -1 : a.shiftDate > b.shiftDate ? 1 : 0))

  return { futuros, passados }
}

/** 2026-10-31 -> 31/10/2026, sem passar por Date (que deslocaria o dia). */
export function dataBR(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * Aviso para a coordenação. Precisa dizer quantos plantões ficaram descobertos
 * e em que datas: é o que faz o administrador ir procurar cobertura.
 */
export function mensagemParaAdmin(nome: string, futurosDoServico: PlantaoFuturo[]): string {
  const base = `${nome} encerrou a conta no MedEscala.`
  const rodape = 'Os plantões já realizados continuam na escala e no financeiro.'

  if (futurosDoServico.length === 0) {
    return `${base} Não havia plantões futuros escalados. ${rodape}`
  }

  const datas = futurosDoServico.map((f) => dataBR(f.shiftDate)).join(', ')
  const n = futurosDoServico.length
  const frase =
    n === 1
      ? '1 plantão futuro ficou sem cobertura e voltou a ser vaga aberta'
      : `${n} plantões futuros ficaram sem cobertura e voltaram a ser vaga aberta`

  return `${base} ${frase}: ${datas}. ${rodape}`
}

export function tituloParaAdmin(futurosDoServico: PlantaoFuturo[]): string {
  return futurosDoServico.length > 0
    ? 'Conta encerrada — plantões futuros descobertos'
    : 'Conta encerrada'
}

/**
 * Trilha permanente de cada plantão liberado. schedule_movements não tem FK
 * nenhuma e guarda o nome em texto, então o registro sobrevive à remoção do
 * plantão, do vínculo e dos dados pessoais.
 */
export function movimentosDeLiberacao(
  futuros: PlantaoFuturo[],
  userId: string,
  nome: string,
  agoraIso: string,
) {
  return futuros.map((f) => {
    const [ano, mes] = f.shiftDate.split('-')
    return {
      tenant_id: f.tenantId,
      month: Number(mes),
      year: Number(ano),
      user_id: userId,
      user_name: nome,
      movement_type: 'removed' as const,
      source_sector_id: f.sectorId,
      source_shift_date: f.shiftDate,
      source_shift_time: f.startTime && f.endTime ? `${f.startTime}-${f.endTime}` : f.startTime,
      source_assignment_id: f.assignmentId,
      reason: 'Conta encerrada pelo próprio profissional',
      performed_by: userId,
      performed_at: agoraIso,
    }
  })
}
