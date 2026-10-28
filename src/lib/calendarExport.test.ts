import { describe, it, expect } from 'vitest';
import { dobrarLinhas, generateICSFile, periodoDoPlantao } from './calendarExport';

const diurno = {
  id: 'p1',
  title: 'Plantão UTI',
  hospital: 'Beneficência Portuguesa',
  location: 'Bloco B',
  shift_date: '2026-11-03',
  start_time: '07:00:00',
  end_time: '19:00:00',
  sector_name: 'UTI Adulto',
};

const noturno = { ...diurno, id: 'p2', start_time: '19:00:00', end_time: '07:00:00' };

function linhas(ics: string): string[] {
  return ics.split('\r\n');
}

describe('periodoDoPlantao', () => {
  it('plantão noturno termina no dia seguinte', () => {
    // O gerador antigo carimbava a mesma data nos dois: o evento terminava
    // doze horas ANTES de começar, e o calendário recusava ou entortava.
    const { inicio, fim } = periodoDoPlantao(noturno);
    expect(fim.getTime()).toBeGreaterThan(inicio.getTime());
    expect((fim.getTime() - inicio.getTime()) / 3_600_000).toBe(12);
    expect(fim.getDate()).toBe(4);
  });

  it('plantão diurno fica no mesmo dia', () => {
    const { inicio, fim } = periodoDoPlantao(diurno);
    expect(fim.getDate()).toBe(3);
    expect((fim.getTime() - inicio.getTime()) / 3_600_000).toBe(12);
  });
});

describe('generateICSFile', () => {
  it('nenhum evento pode terminar antes de começar', () => {
    const ics = generateICSFile([diurno, noturno]);
    const inicios = linhas(ics).filter((l) => l.startsWith('DTSTART:')).map((l) => l.slice(8));
    const fins = linhas(ics).filter((l) => l.startsWith('DTEND:')).map((l) => l.slice(6));

    expect(inicios).toHaveLength(2);
    for (let i = 0; i < inicios.length; i += 1) {
      expect(fins[i] > inicios[i]).toBe(true);
    }
    expect(fins[1]).toBe('20261104T070000');
  });

  it('usa CRLF, como o formato exige', () => {
    const ics = generateICSFile([diurno]);
    expect(ics).toContain('\r\n');
    expect(ics.split('\r\n').join('')).not.toContain('\n');
  });

  it('DTSTAMP marcado como Z é hora de UTC mesmo', () => {
    // Antes escrevia a hora local e carimbava "Z" em cima.
    const stamp = linhas(generateICSFile([diurno])).find((l) => l.startsWith('DTSTAMP:'))!.slice(8);
    const agora = new Date();
    const esperado = `${agora.getUTCFullYear()}${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(stamp.endsWith('Z')).toBe(true);
    expect(stamp.startsWith(esperado)).toBe(true);
  });

  it('a descrição quebra linha de verdade, sem barra invertida à mostra', () => {
    // O join com '\\n' escrevia a barra literal e o médico lia
    // "Setor: UTI Adulto\nHospital: ..." dentro do evento.
    const desc = linhas(generateICSFile([diurno])).find((l) => l.startsWith('DESCRIPTION:'))!;
    expect(desc).toContain('Setor: UTI Adulto\\nHospital:');
    expect(desc).not.toContain('\\\\n');
  });

  it('leva os lembretes que a tela promete', () => {
    const ics = generateICSFile([diurno]);
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT1H');
  });

  it('escapa vírgula e ponto e vírgula do nome do hospital', () => {
    const ics = generateICSFile([{ ...diurno, hospital: 'Hospital X, Unidade; Centro' }]);
    const loc = linhas(ics).find((l) => l.startsWith('LOCATION:'))!;
    expect(loc).toContain('Hospital X\\, Unidade\\; Centro');
  });

  it('abre e fecha o calendário mesmo sem plantão', () => {
    const ics = generateICSFile([]);
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('todo VEVENT é fechado', () => {
    const ics = generateICSFile([diurno, noturno]);
    const abre = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    const fecha = (ics.match(/END:VEVENT/g) ?? []).length;
    expect(abre).toBe(2);
    expect(fecha).toBe(2);
  });
});

describe('dobrarLinhas', () => {
  it('não mexe em linha curta', () => {
    expect(dobrarLinhas(['SUMMARY:Plantão'])).toEqual(['SUMMARY:Plantão']);
  });

  it('continua a linha longa com espaço, e nada se perde', () => {
    const longa = 'DESCRIPTION:' + 'a'.repeat(200);
    const partes = dobrarLinhas([longa]);
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes.slice(1)) expect(p.startsWith(' ')).toBe(true);
    expect(partes.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(longa);
  });

  it('nenhuma linha passa de 75 caracteres', () => {
    const ics = generateICSFile([{ ...diurno, title: 'Plantão '.repeat(30) }]);
    for (const l of ics.split('\r\n')) expect(l.length).toBeLessThanOrEqual(75);
  });
});
