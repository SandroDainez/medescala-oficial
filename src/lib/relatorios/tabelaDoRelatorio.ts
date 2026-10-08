import { format, parseISO } from 'date-fns';

/**
 * Monta a tabela de um relatório UMA vez, para o arquivo e para a impressão.
 *
 * Antes cada saída montava a sua: a exportação só cobria 3 dos 7 tipos (os
 * outros baixavam arquivo vazio) e, nos conflitos, a tela mostrava 11 linhas
 * enquanto o arquivo levava 1. Saídas separadas divergem com o tempo; esta é a
 * única fonte, então o que se vê, o que se imprime e o que se baixa são iguais.
 */

export type SecaoDoRelatorio = {
  /** Subtítulo, para relatórios com mais de um bloco (ex.: financeiro). */
  titulo?: string;
  colunas: string[];
  linhas: string[][];
};

export type TabelaDoRelatorio = {
  titulo: string;
  secoes: SecaoDoRelatorio[];
  /** Linhas de dados somadas (não conta cabeçalho nem linha de total). */
  totalDeLinhas: number;
};

export const TITULOS: Record<string, string> = {
  afastamentos: 'Afastamentos',
  checkins: 'Check-ins e Check-outs',
  plantoes: 'Plantões por Período',
  financeiro: 'Resumo Financeiro',
  movimentacoes: 'Movimentações de Escala',
  conflitos: 'Conflitos de Escala',
  exclusoes: 'Exclusões de Escala (auditoria)',
};

/** dd/MM/yyyy, tolerante a valor ausente ou inválido. */
export function data(valor: string | null | undefined): string {
  if (!valor) return '';
  try {
    return format(parseISO(valor), 'dd/MM/yyyy');
  } catch {
    return '';
  }
}

/** dd/MM/yyyy HH:mm, tolerante a valor ausente ou inválido. */
export function dataHora(valor: string | null | undefined): string {
  if (!valor) return '';
  try {
    return format(parseISO(valor), 'dd/MM/yyyy HH:mm');
  } catch {
    return '';
  }
}

export function horario(inicio?: string | null, fim?: string | null): string {
  const i = (inicio || '').slice(0, 5);
  const f = (fim || '').slice(0, 5);
  return i || f ? `${i} - ${f}` : '';
}

export function moeda(valor: number | null | undefined): string {
  const n = Number(valor ?? 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Horas totais de uma lista de plantões, virando o dia quando o fim é menor. */
export function somarHoras(lista: { start_time?: string | null; end_time?: string | null }[]): number {
  return (lista ?? []).reduce((soma, s) => {
    const [hi, mi] = (s.start_time || '00:00').slice(0, 5).split(':').map(Number);
    const [hf, mf] = (s.end_time || '00:00').slice(0, 5).split(':').map(Number);
    let dur = hf * 60 + mf - (hi * 60 + mi);
    if (dur <= 0) dur += 24 * 60;
    return soma + dur / 60;
  }, 0);
}

export type DadosDosRelatorios = {
  absences?: Array<Record<string, unknown>>;
  checkins?: Array<Record<string, unknown>>;
  shifts?: Array<Record<string, unknown>>;
  conflitos?: Array<Record<string, unknown>>;
  movements?: Array<Record<string, unknown>>;
  deletionLogs?: Array<Record<string, unknown>>;
  financeiroPorPlantonista?: Array<Record<string, unknown>>;
  financeiroPorSetor?: Array<Record<string, unknown>>;
  financeiroPorPlantonistaSetor?: Array<Record<string, unknown>>;
  rotulosTipoAfastamento?: Record<string, string>;
  rotulosStatusAfastamento?: Record<string, string>;
};

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const numero = (v: unknown): number => Number(v ?? 0);

export function montarTabelaDoRelatorio(
  tipo: string,
  dados: DadosDosRelatorios,
): TabelaDoRelatorio {
  const secoes: SecaoDoRelatorio[] = [];
  let totalDeLinhas = 0;

  if (tipo === 'afastamentos') {
    const linhas = (dados.absences ?? []).map((a) => [
      texto(a.user_name),
      dados.rotulosTipoAfastamento?.[texto(a.type)] ?? texto(a.type),
      data(texto(a.start_date)),
      data(texto(a.end_date)),
      texto(a.reason),
      dados.rotulosStatusAfastamento?.[texto(a.status)] ?? texto(a.status),
      texto(a.notes),
    ]);
    totalDeLinhas = linhas.length;
    secoes.push({
      colunas: ['Plantonista', 'Tipo', 'Início', 'Fim', 'Motivo', 'Situação', 'Observações'],
      linhas,
    });
  } else if (tipo === 'checkins') {
    const linhas = (dados.checkins ?? []).map((c) => [
      texto(c.user_name),
      data(texto(c.shift_date)),
      horario(texto(c.start_time), texto(c.end_time)),
      texto(c.sector_name),
      c.checkin_at ? dataHora(texto(c.checkin_at)) : 'Não registrado',
      c.checkout_at ? dataHora(texto(c.checkout_at)) : 'Não registrado',
      c.checkin_latitude ? `${texto(c.checkin_latitude)}, ${texto(c.checkin_longitude)}` : '',
      c.checkout_latitude ? `${texto(c.checkout_latitude)}, ${texto(c.checkout_longitude)}` : '',
    ]);
    totalDeLinhas = linhas.length;
    secoes.push({
      colunas: ['Plantonista', 'Data', 'Horário', 'Setor', 'Check-in', 'Check-out', 'GPS entrada', 'GPS saída'],
      linhas,
    });
  } else if (tipo === 'plantoes') {
    const lista = dados.shifts ?? [];
    const linhas = lista.map((s) => [
      data(texto(s.shift_date)),
      horario(texto(s.start_time), texto(s.end_time)),
      texto(s.sector_name),
      texto(s.title),
      texto(s.hospital),
      s.base_value === null || s.base_value === undefined ? '' : moeda(numero(s.base_value)),
      ((s.assignees as string[]) ?? []).join(' / '),
    ]);
    totalDeLinhas = linhas.length;
    if (linhas.length > 0) {
      const horas = somarHoras(lista as { start_time?: string; end_time?: string }[]);
      linhas.push([
        'TOTAL',
        `${lista.length} ${lista.length === 1 ? 'plantão' : 'plantões'}`,
        `${horas.toFixed(1)}h`,
        '',
        '',
        '',
        '',
      ]);
    }
    secoes.push({
      colunas: ['Data', 'Horário', 'Setor', 'Título', 'Hospital', 'Valor Base', 'Plantonistas'],
      linhas,
    });
  } else if (tipo === 'conflitos') {
    // Ativos e resolvidos juntos, como a tela mostra. Os ativos são os que
    // ainda exigem ação, e eram justamente os que ficavam de fora do arquivo.
    const linhas = (dados.conflitos ?? []).map((c) => {
      const ativo = texto(c.resolution_type) === 'pending';
      return [
        ativo ? 'ATIVO — pendente' : 'Resolvido',
        data(texto(c.conflict_date)),
        texto(c.plantonista_name),
        texto(c.action_taken) || texto(c.resolution_type),
        texto(c.removed_sector_name),
        texto(c.removed_shift_time),
        texto(c.kept_sector_name),
        texto(c.kept_shift_time),
        texto(c.justification),
        dataHora(texto(c.resolved_at)),
        texto(c.resolved_by_name),
      ];
    });
    totalDeLinhas = linhas.length;
    secoes.push({
      colunas: [
        'Situação', 'Data do Conflito', 'Plantonista', 'Ação', 'Setor Removido',
        'Horário Removido', 'Setor Mantido', 'Horário Mantido', 'Justificativa',
        'Resolvido em', 'Resolvido por',
      ],
      linhas,
    });
  } else if (tipo === 'movimentacoes') {
    const linhas = (dados.movements ?? []).map((m) => [
      texto(m.movement_type),
      texto(m.user_name),
      texto(m.source_sector_name),
      data(texto(m.source_shift_date)),
      texto(m.source_shift_time),
      texto(m.destination_sector_name),
      data(texto(m.destination_shift_date)),
      texto(m.destination_shift_time),
      texto(m.reason),
      dataHora(texto(m.performed_at)),
      texto(m.performed_by_name),
    ]);
    totalDeLinhas = linhas.length;
    secoes.push({
      colunas: [
        'Tipo', 'Plantonista', 'Setor de Origem', 'Data de Origem', 'Horário de Origem',
        'Setor de Destino', 'Data de Destino', 'Horário de Destino', 'Motivo',
        'Feito em', 'Feito por',
      ],
      linhas,
    });
  } else if (tipo === 'exclusoes') {
    const linhas = (dados.deletionLogs ?? []).map((d) => [
      dataHora(texto(d.performed_at)),
      texto(d.performed_by_name),
      texto(d.scope),
      texto(d.sector_name),
      data(texto(d.date_from)),
      data(texto(d.date_to)),
      texto(d.shifts_deleted),
      texto(d.assignments_deleted),
    ]);
    totalDeLinhas = linhas.length;
    secoes.push({
      colunas: [
        'Feito em', 'Feito por', 'Abrangência', 'Setor', 'De', 'Até',
        'Plantões Excluídos', 'Atribuições Excluídas',
      ],
      linhas,
    });
  } else if (tipo === 'financeiro') {
    const porPlantonista = (dados.financeiroPorPlantonista ?? []).map((f) => [
      texto(f.user_name),
      texto(f.total_shifts),
      `${numero(f.total_hours).toFixed(1)}h`,
      moeda(numero(f.total_value)),
    ]);
    const porSetor = (dados.financeiroPorSetor ?? []).map((f) => [
      texto(f.sector_name),
      texto(f.total_shifts),
      `${numero(f.total_hours).toFixed(1)}h`,
      moeda(numero(f.total_value)),
    ]);
    const porAmbos = (dados.financeiroPorPlantonistaSetor ?? []).map((f) => [
      texto(f.user_name),
      texto(f.sector_name),
      texto(f.total_shifts),
      `${numero(f.total_hours).toFixed(1)}h`,
      moeda(numero(f.total_value)),
    ]);
    totalDeLinhas = porPlantonista.length + porSetor.length + porAmbos.length;
    secoes.push(
      { titulo: 'Por plantonista', colunas: ['Plantonista', 'Plantões', 'Horas', 'Valor Total'], linhas: porPlantonista },
      { titulo: 'Por setor', colunas: ['Setor', 'Plantões', 'Horas', 'Valor Total'], linhas: porSetor },
      {
        titulo: 'Por plantonista e setor',
        colunas: ['Plantonista', 'Setor', 'Plantões', 'Horas', 'Valor Total'],
        linhas: porAmbos,
      },
    );
  }

  return { titulo: TITULOS[tipo] ?? 'Relatório', secoes, totalDeLinhas };
}

/** CSV com BOM, para o Excel abrir acentuação certa. */
export function tabelaParaCsv(tabela: TabelaDoRelatorio): string {
  const aspas = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const partes: string[] = [];
  tabela.secoes.forEach((secao, i) => {
    if (i > 0) partes.push('');
    if (secao.titulo) partes.push(aspas(secao.titulo.toUpperCase()));
    partes.push(secao.colunas.map(aspas).join(','));
    secao.linhas.forEach((linha) => partes.push(linha.map(aspas).join(',')));
  });
  return partes.join('\n') + '\n';
}

const escaparHtml = (v: string) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Página pronta para impressão, a partir da mesma tabela que gera o arquivo.
 *
 * Fica aqui, e não na tela, para poder ser testada: antes a impressão era
 * montada à mão em cada lugar e não havia como provar que o conteúdo batia
 * com o que o usuário via.
 */
export function tabelaParaHtmlDeImpressao(
  tabela: TabelaDoRelatorio,
  opcoes: { periodo?: string; emitidoEm?: string } = {},
): string {
  const secoes = tabela.secoes
    .filter((s) => s.linhas.length > 0)
    .map(
      (s) => `
        ${s.titulo ? `<h2>${escaparHtml(s.titulo)}</h2>` : ''}
        <table>
          <thead><tr>${s.colunas.map((c) => `<th>${escaparHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>
            ${s.linhas
              .map((linha) => `<tr>${linha.map((c) => `<td>${escaparHtml(c)}</td>`).join('')}</tr>`)
              .join('')}
          </tbody>
        </table>`,
    )
    .join('');

  const registros = `${tabela.totalDeLinhas} ${tabela.totalDeLinhas === 1 ? 'registro' : 'registros'}`;
  const subtitulo = [opcoes.periodo, registros, opcoes.emitidoEm && `emitido em ${opcoes.emitidoEm}`]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>${escaparHtml(tabela.titulo)} — MedEscala</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  .sub { color: #555; font-size: 12px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 11px; text-align: left; vertical-align: top; }
  th { background: #f1f1f1; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  @media print { @page { size: landscape; margin: 12mm; } body { margin: 0; } }
</style></head>
<body>
  <h1>${escaparHtml(tabela.titulo)}</h1>
  <p class="sub">${escaparHtml(subtitulo)}</p>
  ${secoes}
</body></html>`;
}
