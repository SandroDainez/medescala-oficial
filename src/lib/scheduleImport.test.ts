import { describe, expect, it } from 'vitest';
import {
  buildImportNameReport,
  isLegendCell,
  isVacancyMarker,
  matchImportedName,
  parseEscalasGrid,
  type GridCell,
  type ImportPerson,
} from './scheduleImport';

const LEGEND = 'FU: Furo | FJ: Falta Justificada | FN: Falta Não Justificada | CO: Cobertura | FR: Férias';

function header(): GridCell[][] {
  return [
    Array(3).fill('gerado em 14/09/2026 10:57:42 (UTC -3)'),
    ['ESCALAS', '', ''],
    ['LOCAL: UTI APAS - HOSPITAL SANTO EXPEDITO', '', ''],
    Array(3).fill('PROFISSIONAL DE PLANTÃO'),
    Array(3).fill('01/09/2026~30/09/2026'),
    ['', '', ''],
  ];
}

const p = (user_id: string, name: string, extra: Partial<ImportPerson> = {}): ImportPerson => ({
  user_id,
  name,
  full_name: name,
  profile_type: 'plantonista',
  role: 'user',
  ...extra,
});

describe('parseEscalasGrid', () => {
  it('lê faixas em alturas diferentes por coluna, sem faixa fantasma', () => {
    const matrix: GridCell[][] = [
      ...header(),
      ['SEG 31/08', 'TER 01/09', 'QUA 02/09'],
      ['', '07:00~13:00', '07:00~19:00'],
      ['', 'CAMILLA RIOS', 'ANA SOUZA'],
      ['', '07:00~19:00', 'BRUNO LIMA'],
      ['', 'CAROLINA BRAGA', '19:00~07:00'],
      ['', 'ANDRE CASTRO', 'CARLOS JUNIOR'],
      ['', '19:00~07:00', ''],
      ['', 'KAYAN BISTULFI', ''],
    ];
    const { slots, warnings } = parseEscalasGrid(matrix, { fallbackYear: 2026 });

    // 31/08 está fora do período declarado (01/09~30/09)
    expect(slots.some((s) => s.date === '2026-08-31')).toBe(false);

    const ter = slots.filter((s) => s.date === '2026-09-01');
    expect(ter.map((s) => `${s.start}-${s.end}:${s.names.join('+')}:${s.vacancies}`)).toEqual([
      '07:00-13:00:CAMILLA RIOS:0',
      '07:00-19:00:CAROLINA BRAGA+ANDRE CASTRO:0',
      '19:00-07:00:KAYAN BISTULFI:0',
    ]);

    const qua = slots.filter((s) => s.date === '2026-09-02');
    expect(qua.map((s) => `${s.start}-${s.end}:${s.names.join('+')}`)).toEqual([
      '07:00-19:00:ANA SOUZA+BRUNO LIMA',
      '19:00-07:00:CARLOS JUNIOR',
    ]);
    expect(warnings).toEqual([]);
  });

  it('ignora a legenda do rodapé (não vira plantonista)', () => {
    const matrix: GridCell[][] = [
      ...header(),
      ['SEG 28/09', 'TER 29/09', 'QUA 30/09'],
      ['07:00~19:00', '07:00~19:00', '07:00~19:00'],
      ['JOHN AGUIRRE', 'JOSE LEAL', 'KEVIN MAYSER'],
      ['', '', ''],
      [LEGEND, LEGEND, LEGEND],
    ];
    const { slots } = parseEscalasGrid(matrix, { fallbackYear: 2026 });
    const allNames = slots.flatMap((s) => s.names);
    expect(allNames).toEqual(['JOHN AGUIRRE', 'JOSE LEAL', 'KEVIN MAYSER']);
    expect(allNames.some((n) => /furo|falta|cobertura|férias/i.test(n))).toBe(false);
  });

  it('"<Sem Responsável>" é vaga, não nome', () => {
    const matrix: GridCell[][] = [
      ...header(),
      ['DOM 27/09', '', ''],
      ['07:00~19:00', '', ''],
      ['<Sem Responsável>', '', ''],
      ['19:00~07:00', '', ''],
      ['MARUAN SULTANI', '', ''],
      ['<Sem Responsável>', '', ''],
    ];
    const { slots } = parseEscalasGrid(matrix, { fallbackYear: 2026 });
    expect(slots).toMatchObject([
      { start: '07:00', end: '19:00', names: [], vacancies: 1 },
      { start: '19:00', end: '07:00', names: ['MARUAN SULTANI'], vacancies: 1 },
    ]);
  });

  it('faixa sem ninguém embaixo vira 1 vaga', () => {
    const matrix: GridCell[][] = [...header(), ['SEX 18/09', '', ''], ['19:00~07:00', '', ''], ['', '', '']];
    const { slots } = parseEscalasGrid(matrix, { fallbackYear: 2026 });
    expect(slots).toMatchObject([{ date: '2026-09-18', start: '19:00', names: [], vacancies: 1 }]);
  });

  it('nome sem horário acima assume 07–19 e avisa', () => {
    const matrix: GridCell[][] = [['SEG 07/09'], ['FULANO DE TAL']];
    const { slots, warnings } = parseEscalasGrid(matrix, { fallbackYear: 2026 });
    expect(slots).toMatchObject([{ date: '2026-09-07', start: '07:00', end: '19:00', names: ['FULANO DE TAL'] }]);
    expect(warnings.join(' ')).toMatch(/sem horário/);
  });

  it('mesmo nome duas vezes na mesma faixa conta uma vez e avisa', () => {
    const matrix: GridCell[][] = [['QUA 16/09'], ['07:00~19:00'], ['PEDRO SANTOS'], ['PEDRO SANTOS']];
    const { slots, warnings } = parseEscalasGrid(matrix, { fallbackYear: 2026 });
    expect(slots[0].names).toEqual(['PEDRO SANTOS']);
    expect(warnings.join(' ')).toMatch(/repetido/);
  });

  it('período dezembro→janeiro usa o ano seguinte para janeiro', () => {
    const matrix: GridCell[][] = [
      ['28/12/2026~10/01/2027'],
      ['QUI 31/12', 'SEX 01/01'],
      ['07:00~19:00', '07:00~19:00'],
      ['ANA', 'BIA'],
    ];
    const { slots } = parseEscalasGrid(matrix, { fallbackYear: 2026 });
    expect(slots.map((s) => s.date)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('detectores de legenda e vaga', () => {
    expect(isLegendCell(LEGEND)).toBe(true);
    expect(isLegendCell('ANDRÉ CARLOS MILANEZ DE CASTRO')).toBe(false);
    expect(isVacancyMarker('<Sem Responsável>')).toBe(true);
    expect(isVacancyMarker('VAGO')).toBe(true);
    expect(isVacancyMarker('VAGNER SILVA')).toBe(false);
  });
});

describe('matchImportedName', () => {
  const people: ImportPerson[] = [
    p('jose-miguel', 'JOSÉ MIGUEL SALVATIERRA ANEZ'),
    p('sabastian', 'SABASTIAN SALVATIERRA ANEZ'),
    p('maruam', 'Maruam Sultani'),
    p('victor-hugo', 'VICTOR HUGO RIOS NOLIVOS'),
    p('victor-yuri', 'VICTOR YURI PEREIRA DAMASCENO'),
    p('kevin-admin', 'Kevin Tardio Mayser', { profile_type: 'admin' }),
    p('kevin-plant', 'KEVIN T MAYSER'),
    p('pedro-santos', 'PEDRO HENRIQUE DOS SANTOS'),
    p('pedro-garcia', 'PEDRO HENRIQUE GARCIA'),
    p('sandro', 'SANDRO DAINEZ'),
    p('lucas', 'LUCAS MEROUCO BATISTA'),
    p('flavio', 'FLAVIO ALEJANDRO VILLA GONZALEZ', { profile_type: 'medico_estrangeiro' }),
  ];

  const who = (name: string) => {
    const m = matchImportedName(name, people);
    return m.status === 'matched' ? m.person.user_id : m.status;
  };

  it('sobrenome em comum NÃO troca a pessoa; erro de 1 letra no primeiro nome é tolerado', () => {
    expect(who('SEBASTIAN SALVATIERRA ANEZ')).toBe('sabastian');
    expect(who('JOSÉ MIGUEL SALVATIERRA ANEZ')).toBe('jose-miguel');
  });

  it('erro de digitação de 1 letra no sobrenome', () => {
    expect(who('MARUAN SULTANI')).toBe('maruam');
  });

  it('nome curto casa com o completo quando só há um compatível', () => {
    expect(who('VICTOR HUGO')).toBe('victor-hugo');
    expect(who('SANDRO ROGERIO DAINEZ')).toBe('sandro');
  });

  it('acentos e cedilha não importam', () => {
    expect(who('LUCAS MEROUÇO BATISTA')).toBe('lucas');
  });

  it('dois candidatos compatíveis = ambíguo (não chuta)', () => {
    expect(who('PEDRO HENRIQUE')).toBe('ambiguous');
    expect(who('PEDRO HENRIQUE DOS SANTOS')).toBe('pedro-santos');
  });

  it('nome exato em conta admin usa a conta de plantonista compatível da mesma pessoa', () => {
    const m = matchImportedName('KEVIN TARDIO MAYSER', people);
    expect(m).toMatchObject({ status: 'matched', approximate: true, eligible: true, person: { user_id: 'kevin-plant' } });
  });

  it('perfil que não pode receber plantão é reportado como inelegível', () => {
    const m = matchImportedName('FLAVIO ALEJANDRO VILLA GONZALEZ', people);
    expect(m).toMatchObject({ status: 'matched', eligible: false, person: { user_id: 'flavio' } });
  });

  it('não cadastrado', () => {
    expect(who('MÁRIO JUSTINIANO ARAUZ')).toBe('not_found');
    expect(who('VICTOR')).toBe('not_found');
  });

  it('palavras curtas não são tratadas como erro de digitação', () => {
    const local = [p('luiz', 'LUIZ SOUZA')];
    expect(matchImportedName('LUIS SOUZA', local).status).toBe('not_found');
  });
});

describe('buildImportNameReport', () => {
  it('resume vínculos, vagas, vínculo automático de setor e pendências', () => {
    const people = [p('a', 'ANA SOUZA'), p('b', 'BRUNO LIMA'), p('adm', 'CARLA DIAS', { profile_type: 'admin' })];
    const rows = [
      { sector_id: 's1', sector_name: 'UTI', assignee_names: ['ANA SOUZA'] },
      { sector_id: 's1', sector_name: 'UTI', assignee_names: ['BRUNO LIMA'] },
      { sector_id: 's1', sector_name: 'UTI', assignee_names: ['BRUNO LIMA'] },
      { sector_id: 's1', sector_name: 'UTI' },
      { sector_id: 's1', sector_name: 'UTI', assignee_names: ['FULANO NOVO'] },
      { sector_id: 's1', sector_name: 'UTI', assignee_names: ['CARLA DIAS'] },
    ];
    const r = buildImportNameReport(rows, people, [{ sector_id: 's1', user_id: 'a' }]);
    expect(r.assignments).toBe(3);
    expect(r.vacancies).toBe(1);
    expect(r.sectorLinks).toEqual([{ person: 'BRUNO LIMA', sector: 'UTI' }]);
    expect(r.notFound).toEqual([{ name: 'FULANO NOVO', count: 1 }]);
    expect(r.ineligible).toEqual([{ name: 'CARLA DIAS', person: 'CARLA DIAS', count: 1 }]);
    expect(r.ambiguous).toEqual([]);
    expect(r.diaristas).toEqual([]);
  });

  it('diaristas/visitadores ficam fora por padrão e entram quando incluídos', () => {
    const people = [
      p('plant', 'ANA SOUZA'),
      p('dia', 'THIAGO BUENO', { is_diarista: true }),
    ];
    const rows = [
      { sector_id: 'uti', sector_name: 'UTI', assignee_names: ['ANA SOUZA'] },
      { sector_id: 'uti', sector_name: 'UTI', assignee_names: ['THIAGO BUENO'] },
      { sector_id: 'uti', sector_name: 'UTI', assignee_names: ['THIAGO BUENO'] },
    ];
    const members = [
      { sector_id: 'uti', user_id: 'plant' },
      { sector_id: 'uti', user_id: 'dia' },
    ];

    const fora = buildImportNameReport(rows, people, members);
    expect(fora.assignments).toBe(1);
    expect(fora.vacancies).toBe(0); // diarista fora não vira vaga
    expect(fora.diaristas).toEqual([{ userId: 'dia', person: 'THIAGO BUENO', count: 2, included: false }]);

    const dentro = buildImportNameReport(rows, people, members, new Set(['dia']));
    expect(dentro.assignments).toBe(3);
    expect(dentro.diaristas[0].included).toBe(true);
  });
});
