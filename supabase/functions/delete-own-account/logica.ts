/**
 * Decisões puras do encerramento de conta, separadas do index.ts para poderem
 * ser testadas sem subir servidor nem tocar no banco.
 *
 * REGRA DE OURO: encerrar a conta é sair do APLICATIVO, não sair do serviço.
 * O MedEscala é contratado por hospitais, clínicas e grupos — a escala pertence
 * a eles, não ao médico. Um médico pode largar o app e continuar trabalhando
 * normalmente, então o encerramento NÃO mexe em plantão nenhum, nem futuro.
 * Quem sabe se a pessoa saiu de verdade é a coordenação, e é ela que decide,
 * pelo botão "Remover do serviço".
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
 * o plantão desta noite sumiria da contagem e ninguém seria avisado dele.
 */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD.
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Separa o que já foi trabalhado do que ainda vai acontecer.
 *
 * Nenhum dos dois é apagado: a separação existe só para avisar a coordenação,
 * e para avisar o próprio médico de que encerrar a conta não cancela plantão.
 * O plantão de hoje conta como futuro — ainda vai ser cumprido.
 */
export function separarPlantoes(
  atribuicoes: AtribuicaoBruta[],
  hoje: string,
): { futuros: PlantaoFuturo[]; passados: number } {
  const futuros: PlantaoFuturo[] = []
  let passados = 0

  for (const a of atribuicoes ?? []) {
    const s = a.shifts
    if (!s?.shift_date) continue // sem data não dá para classificar

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
 * Aviso para a coordenação.
 *
 * Precisa deixar claro que a escala NÃO mudou e que a decisão é dela: se a
 * pessoa só largou o app, não há o que fazer; se saiu do serviço, é "Remover
 * do serviço" que libera os plantões.
 */
export function mensagemParaAdmin(nome: string, futurosDoServico: PlantaoFuturo[]): string {
  const base = `${nome} encerrou a conta e não usa mais o aplicativo.`
  const escalaIntacta = 'A escala não foi alterada: os plantões continuam no nome dele.'

  if (futurosDoServico.length === 0) {
    return `${base} ${escalaIntacta} Não há plantões futuros escalados.`
  }

  const datas = futurosDoServico.map((f) => dataBR(f.shiftDate)).join(', ')
  const n = futurosDoServico.length
  const quantos =
    n === 1 ? 'Há 1 plantão futuro no nome dele' : `Há ${n} plantões futuros no nome dele`

  return (
    `${base} ${escalaIntacta} ${quantos}: ${datas}. ` +
    'Confirme com ele se vai cumprir. Se ele também saiu do serviço, use "Remover do serviço" ' +
    'em Usuários para liberar esses plantões.'
  )
}

export function tituloParaAdmin(futurosDoServico: PlantaoFuturo[]): string {
  return futurosDoServico.length > 0
    ? 'Conta encerrada — confira os plantões futuros'
    : 'Conta encerrada'
}
