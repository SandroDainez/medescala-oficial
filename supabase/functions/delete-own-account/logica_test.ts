import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  type AtribuicaoBruta,
  dataBR,
  hojeEmBrasilia,
  mensagemParaAdmin,
  movimentosDeLiberacao,
  separarPlantoes,
  tituloParaAdmin,
} from './logica.ts'

const plantao = (
  id: string,
  shift_date: string,
  extra: Partial<NonNullable<AtribuicaoBruta['shifts']>> = {},
): AtribuicaoBruta => ({
  id,
  tenant_id: 'tenant-a',
  shifts: { shift_date, title: 'UTI Adulto', start_time: '07:00:00', end_time: '19:00:00', ...extra },
})

// ── hojeEmBrasilia ──────────────────────────────────────────────────────────

Deno.test('hojeEmBrasilia: às 21h de Brasília ainda é hoje, mesmo já sendo amanhã em UTC', () => {
  // 2026-10-07T00:30:00Z = 06/10/2026 21:30 em Brasília.
  const agora = new Date('2026-10-07T00:30:00Z')
  assertEquals(agora.toISOString().slice(0, 10), '2026-10-07') // o que current_date (UTC) diria
  assertEquals(hojeEmBrasilia(agora), '2026-10-06') // o que o médico chama de hoje
})

Deno.test('hojeEmBrasilia: às 02h de Brasília o dia já virou', () => {
  const agora = new Date('2026-10-06T05:10:00Z') // 02:10 em Brasília
  assertEquals(hojeEmBrasilia(agora), '2026-10-06')
})

Deno.test('hojeEmBrasilia: meio-dia bate com a data em UTC', () => {
  assertEquals(hojeEmBrasilia(new Date('2026-10-06T15:00:00Z')), '2026-10-06')
})

// ── separarPlantoes ─────────────────────────────────────────────────────────

Deno.test('separarPlantoes: o plantão de hoje conta como futuro e vira vaga aberta', () => {
  const { futuros, passados } = separarPlantoes([plantao('a', '2026-10-06')], '2026-10-06')
  assertEquals(futuros.length, 1)
  assertEquals(passados, 0)
  assertEquals(futuros[0].assignmentId, 'a')
})

Deno.test('separarPlantoes: o de ontem conta como trabalho feito e é preservado', () => {
  const { futuros, passados } = separarPlantoes([plantao('a', '2026-10-05')], '2026-10-06')
  assertEquals(futuros.length, 0)
  assertEquals(passados, 1)
})

Deno.test('separarPlantoes: plantão da noite não é perdido por conta do fuso', () => {
  // Cenário real: médico encerra a conta às 21h30; tem plantão hoje 19h-07h.
  // Com current_date em UTC (2026-10-07), este plantão seria tratado como
  // passado e ficaria no nome dele — a UTI apareceria coberta e ninguém iria.
  const agora = new Date('2026-10-07T00:30:00Z')
  const hoje = hojeEmBrasilia(agora)
  const { futuros, passados } = separarPlantoes(
    [plantao('noturno', '2026-10-06', { start_time: '19:00:00', end_time: '07:00:00' })],
    hoje,
  )
  assertEquals(futuros.length, 1, 'o plantão desta noite tem que ser liberado')
  assertEquals(passados, 0)
})

Deno.test('separarPlantoes: separa, conta e ordena por data', () => {
  const { futuros, passados } = separarPlantoes(
    [
      plantao('d', '2026-10-31'),
      plantao('a', '2026-09-01'),
      plantao('c', '2026-10-10'),
      plantao('b', '2026-10-06'),
      plantao('z', '2026-01-15'),
    ],
    '2026-10-06',
  )
  assertEquals(passados, 2)
  assertEquals(
    futuros.map((f) => f.assignmentId),
    ['b', 'c', 'd'],
  )
})

Deno.test('separarPlantoes: atribuição sem data não é mexida nem contada', () => {
  const semData: AtribuicaoBruta = { id: 'x', tenant_id: 'tenant-a', shifts: { shift_date: null } }
  const semShift: AtribuicaoBruta = { id: 'y', tenant_id: 'tenant-a', shifts: null }
  const { futuros, passados } = separarPlantoes([semData, semShift], '2026-10-06')
  assertEquals(futuros.length, 0)
  assertEquals(passados, 0)
})

Deno.test('separarPlantoes: lista vazia não quebra', () => {
  assertEquals(separarPlantoes([], '2026-10-06'), { futuros: [], passados: 0 })
})

Deno.test('separarPlantoes: guarda o setor para a vaga reabrir no lugar certo', () => {
  const { futuros } = separarPlantoes(
    [plantao('a', '2026-10-20', { sector_id: 'setor-uti', title: 'UTI Irmã Dulce' })],
    '2026-10-06',
  )
  assertEquals(futuros[0].sectorId, 'setor-uti')
  assertEquals(futuros[0].title, 'UTI Irmã Dulce')
})

Deno.test('separarPlantoes: plantão sem título ganha rótulo genérico', () => {
  const { futuros } = separarPlantoes(
    [plantao('a', '2026-10-20', { title: null })],
    '2026-10-06',
  )
  assertEquals(futuros[0].title, 'Plantão')
})

// ── dataBR ──────────────────────────────────────────────────────────────────

Deno.test('dataBR: converte sem passar por Date, que deslocaria o dia', () => {
  assertEquals(dataBR('2026-10-06'), '06/10/2026')
  assertEquals(dataBR('2026-01-01'), '01/01/2026')
  // new Date('2026-01-01') em Brasília cairia em 31/12/2025.
  assertEquals(dataBR('2026-01-01').startsWith('01/01'), true)
})

// ── mensagemParaAdmin ───────────────────────────────────────────────────────

Deno.test('mensagemParaAdmin: diz quantos e em que datas ficou descoberto', () => {
  const { futuros } = separarPlantoes(
    [plantao('a', '2026-10-10'), plantao('b', '2026-10-20')],
    '2026-10-06',
  )
  const msg = mensagemParaAdmin('FLÁVIO DE ANGELIS', futuros)
  assertEquals(msg.includes('FLÁVIO DE ANGELIS'), true)
  assertEquals(msg.includes('2 plantões futuros'), true)
  assertEquals(msg.includes('10/10/2026'), true)
  assertEquals(msg.includes('20/10/2026'), true)
  assertEquals(msg.includes('continuam na escala e no financeiro'), true)
})

Deno.test('mensagemParaAdmin: singular quando é um só', () => {
  const { futuros } = separarPlantoes([plantao('a', '2026-10-10')], '2026-10-06')
  const msg = mensagemParaAdmin('Dr. Teste', futuros)
  assertEquals(msg.includes('1 plantão futuro ficou'), true)
  assertEquals(msg.includes('voltou a ser vaga aberta'), true)
  // "plantões" ainda aparece no rodapé sobre os já realizados — o que não pode
  // é pluralizar o que ficou descoberto.
  assertEquals(msg.includes('plantões futuros'), false)
  assertEquals(msg.includes('voltaram'), false)
})

Deno.test('mensagemParaAdmin: sem futuros, avisa que nada ficou descoberto', () => {
  const msg = mensagemParaAdmin('Dr. Teste', [])
  assertEquals(msg.includes('Não havia plantões futuros'), true)
  assertEquals(tituloParaAdmin([]), 'Conta encerrada')
})

Deno.test('tituloParaAdmin: com futuros, o título alerta', () => {
  const { futuros } = separarPlantoes([plantao('a', '2026-10-10')], '2026-10-06')
  assertEquals(tituloParaAdmin(futuros), 'Conta encerrada — plantões futuros descobertos')
})

// ── movimentosDeLiberacao ───────────────────────────────────────────────────

Deno.test('movimentosDeLiberacao: mês e ano saem da data do plantão, não de hoje', () => {
  const { futuros } = separarPlantoes([plantao('a', '2026-10-31')], '2026-10-06')
  const [mov] = movimentosDeLiberacao(futuros, 'user-1', 'FLÁVIO', '2026-10-06T12:00:00Z')
  assertEquals(mov.month, 10)
  assertEquals(mov.year, 2026)
  assertEquals(mov.source_shift_date, '2026-10-31')
})

Deno.test('movimentosDeLiberacao: guarda o nome em texto, que sobrevive à remoção', () => {
  const { futuros } = separarPlantoes([plantao('a', '2026-10-10')], '2026-10-06')
  const [mov] = movimentosDeLiberacao(futuros, 'user-1', 'FLÁVIO DE ANGELIS', '2026-10-06T12:00:00Z')
  assertEquals(mov.user_name, 'FLÁVIO DE ANGELIS')
  assertEquals(mov.user_id, 'user-1')
  assertEquals(mov.movement_type, 'removed')
  assertEquals(mov.reason, 'Conta encerrada pelo próprio profissional')
  assertEquals(mov.source_assignment_id, 'a')
})

Deno.test('movimentosDeLiberacao: horário vira faixa quando há início e fim', () => {
  const { futuros } = separarPlantoes([plantao('a', '2026-10-10')], '2026-10-06')
  const [mov] = movimentosDeLiberacao(futuros, 'u', 'N', '2026-10-06T12:00:00Z')
  assertEquals(mov.source_shift_time, '07:00:00-19:00:00')
})

Deno.test('movimentosDeLiberacao: sem hora de fim, guarda só o início', () => {
  const { futuros } = separarPlantoes(
    [plantao('a', '2026-10-10', { end_time: null })],
    '2026-10-06',
  )
  const [mov] = movimentosDeLiberacao(futuros, 'u', 'N', '2026-10-06T12:00:00Z')
  assertEquals(mov.source_shift_time, '07:00:00')
})

Deno.test('movimentosDeLiberacao: um registro por plantão liberado', () => {
  const { futuros } = separarPlantoes(
    [plantao('a', '2026-10-10'), plantao('b', '2026-11-01'), plantao('c', '2026-12-25')],
    '2026-10-06',
  )
  const movs = movimentosDeLiberacao(futuros, 'u', 'N', '2026-10-06T12:00:00Z')
  assertEquals(movs.length, 3)
  assertEquals(
    movs.map((m) => `${m.month}/${m.year}`),
    ['10/2026', '11/2026', '12/2026'],
  )
})
