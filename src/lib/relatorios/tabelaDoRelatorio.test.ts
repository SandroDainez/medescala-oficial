import { describe, it, expect } from 'vitest';
import {
  TITULOS,
  data,
  dataHora,
  horario,
  moeda,
  montarTabelaDoRelatorio,
  somarHoras,
  tabelaParaCsv,
  tabelaParaHtmlDeImpressao,
} from './tabelaDoRelatorio';

describe('formatadores', () => {
  it('data e hora toleram ausente e inválido, em vez de quebrar', () => {
    // Conflito ativo chega com resolved_at vazio; parseISO('') lançaria erro e
    // derrubaria a exportação inteira.
    expect(data('')).toBe('');
    expect(data(null)).toBe('');
    expect(dataHora('')).toBe('');
    expect(dataHora('não é data')).toBe('');
  });

  it('data não desloca o dia', () => {
    expect(data('2026-01-01')).toBe('01/01/2026');
    expect(data('2026-10-31')).toBe('31/10/2026');
  });

  it('horário corta os segundos', () => {
    expect(horario('07:00:00', '19:00:00')).toBe('07:00 - 19:00');
    expect(horario(null, null)).toBe('');
  });

  it('moeda sai em real', () => {
    expect(moeda(1200)).toContain('1.200,00');
    expect(moeda(null)).toContain('0,00');
  });

  it('somarHoras vira o dia no plantão noturno', () => {
    expect(somarHoras([{ start_time: '19:00', end_time: '07:00' }])).toBe(12);
    expect(somarHoras([{ start_time: '07:00', end_time: '19:00' }])).toBe(12);
    expect(somarHoras([])).toBe(0);
  });
});

describe('montarTabelaDoRelatorio', () => {
  it('TODOS os sete tipos do seletor produzem tabela com colunas', () => {
    // Era o defeito: quatro tipos nao tinham exportacao e baixavam arquivo vazio.
    for (const tipo of Object.keys(TITULOS)) {
      const t = montarTabelaDoRelatorio(tipo, {});
      expect(t.secoes.length, `tipo ${tipo} sem seção`).toBeGreaterThan(0);
      expect(t.secoes[0].colunas.length, `tipo ${tipo} sem colunas`).toBeGreaterThan(0);
      expect(t.titulo).not.toBe('Relatório');
    }
  });

  it('tipo desconhecido não quebra, só devolve vazio', () => {
    const t = montarTabelaDoRelatorio('inexistente', {});
    expect(t.secoes).toEqual([]);
    expect(t.totalDeLinhas).toBe(0);
  });

  it('conflitos levam ativos E resolvidos, marcando qual é qual', () => {
    const t = montarTabelaDoRelatorio('conflitos', {
      conflitos: [
        { resolution_type: 'pending', conflict_date: '2026-10-16', plantonista_name: 'DR. BRUNO', action_taken: 'Conflito ativo', resolved_at: '' },
        { resolution_type: 'removed', conflict_date: '2026-10-15', plantonista_name: 'DR. CAIO', action_taken: 'Removido', resolved_at: '2026-10-08T11:21:00Z' },
      ],
    });
    expect(t.totalDeLinhas).toBe(2);
    expect(t.secoes[0].linhas[0][0]).toBe('ATIVO — pendente');
    expect(t.secoes[0].linhas[1][0]).toBe('Resolvido');
    expect(t.secoes[0].linhas[0][9]).toBe(''); // ativo não tem data de resolução
    expect(t.secoes[0].linhas[1][9]).not.toBe('');
  });

  it('plantões ganham linha de TOTAL, que não conta como dado', () => {
    const t = montarTabelaDoRelatorio('plantoes', {
      shifts: [
        { shift_date: '2026-10-01', start_time: '07:00', end_time: '19:00', sector_name: 'UTI', title: 'Diurno', hospital: 'H', base_value: 1200, assignees: ['ANA'] },
        { shift_date: '2026-10-02', start_time: '19:00', end_time: '07:00', sector_name: 'UTI', title: 'Noturno', hospital: 'H', base_value: 1500, assignees: ['BRUNO'] },
      ],
    });
    expect(t.totalDeLinhas).toBe(2);
    const linhas = t.secoes[0].linhas;
    expect(linhas.length).toBe(3); // 2 dados + TOTAL
    expect(linhas[2][0]).toBe('TOTAL');
    expect(linhas[2][1]).toBe('2 plantões');
    expect(linhas[2][2]).toBe('24.0h');
  });

  it('sem plantões, não inventa linha de TOTAL', () => {
    const t = montarTabelaDoRelatorio('plantoes', { shifts: [] });
    expect(t.secoes[0].linhas.length).toBe(0);
    expect(t.totalDeLinhas).toBe(0);
  });

  it('financeiro traz as três visões da tela', () => {
    const t = montarTabelaDoRelatorio('financeiro', {
      financeiroPorPlantonista: [{ user_name: 'ANA', total_shifts: 2, total_hours: 24, total_value: 2400 }],
      financeiroPorSetor: [{ sector_name: 'UTI', total_shifts: 2, total_hours: 24, total_value: 2400 }],
      financeiroPorPlantonistaSetor: [{ user_name: 'ANA', sector_name: 'UTI', total_shifts: 2, total_hours: 24, total_value: 2400 }],
    });
    expect(t.secoes.map((s) => s.titulo)).toEqual(['Por plantonista', 'Por setor', 'Por plantonista e setor']);
    expect(t.totalDeLinhas).toBe(3);
  });

  it('afastamentos traduzem tipo e situação pelos rótulos da tela', () => {
    const t = montarTabelaDoRelatorio('afastamentos', {
      absences: [{ user_name: 'ANA', type: 'ferias', start_date: '2026-10-01', end_date: '2026-10-10', status: 'approved' }],
      rotulosTipoAfastamento: { ferias: 'Férias' },
      rotulosStatusAfastamento: { approved: 'Aprovado' },
    });
    expect(t.secoes[0].linhas[0][1]).toBe('Férias');
    expect(t.secoes[0].linhas[0][5]).toBe('Aprovado');
  });
});

describe('tabelaParaCsv', () => {
  it('escapa aspas para não quebrar a coluna', () => {
    const csv = tabelaParaCsv({
      titulo: 'x',
      totalDeLinhas: 1,
      secoes: [{ colunas: ['A'], linhas: [['disse "oi"']] }],
    });
    expect(csv).toContain('"disse ""oi"""');
  });

  it('separa as seções e escreve o subtítulo', () => {
    const csv = tabelaParaCsv({
      titulo: 'x',
      totalDeLinhas: 2,
      secoes: [
        { titulo: 'Por setor', colunas: ['Setor'], linhas: [['UTI']] },
        { titulo: 'Por plantonista', colunas: ['Nome'], linhas: [['ANA']] },
      ],
    });
    expect(csv).toContain('"POR SETOR"');
    expect(csv).toContain('"POR PLANTONISTA"');
    expect(csv.split('\n').filter((l) => l === '').length).toBeGreaterThan(0);
  });
});

describe('tabelaParaHtmlDeImpressao', () => {
  const tabela = montarTabelaDoRelatorio('plantoes', {
    shifts: [
      { shift_date: '2026-10-01', start_time: '07:00', end_time: '19:00', sector_name: 'UTI', title: 'Diurno', hospital: 'H', base_value: 1200, assignees: ['ANA'] },
    ],
  });

  it('gera documento completo, com título e cabeçalho da tabela', () => {
    const html = tabelaParaHtmlDeImpressao(tabela, { periodo: '01/10/2026 a 31/10/2026', emitidoEm: '08/10/2026 09:30' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Plantões por Período — MedEscala</title>');
    expect(html).toContain('01/10/2026 a 31/10/2026');
    expect(html).toContain('1 registro');
    expect(html).toContain('emitido em 08/10/2026 09:30');
    expect(html).toContain('<th>Plantonistas</th>');
    expect(html).toContain('<td>ANA</td>');
    expect(html).toContain('<td>TOTAL</td>');
  });

  it('imprime em paisagem — a tabela é larga', () => {
    expect(tabelaParaHtmlDeImpressao(tabela)).toContain('size: landscape');
  });

  it('escapa HTML vindo dos dados, para o nome não virar marcação', () => {
    const t = montarTabelaDoRelatorio('afastamentos', {
      absences: [{ user_name: '<script>alerta()</script>', type: 'x', start_date: '2026-10-01', end_date: '2026-10-02', status: 'y' }],
    });
    const html = tabelaParaHtmlDeImpressao(t);
    expect(html).not.toContain('<script>alerta()');
    expect(html).toContain('&lt;script&gt;');
  });

  it('seção sem linhas não vira tabela vazia na folha', () => {
    const t = montarTabelaDoRelatorio('financeiro', {
      financeiroPorPlantonista: [{ user_name: 'ANA', total_shifts: 1, total_hours: 12, total_value: 1200 }],
      financeiroPorSetor: [],
      financeiroPorPlantonistaSetor: [],
    });
    const html = tabelaParaHtmlDeImpressao(t);
    expect(html).toContain('Por plantonista');
    expect(html).not.toContain('Por setor');
    expect((html.match(/<table>/g) ?? []).length).toBe(1);
  });
});
