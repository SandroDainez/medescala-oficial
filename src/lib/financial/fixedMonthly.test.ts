import { describe, expect, it } from 'vitest';
import { aggregateFinancial } from './aggregateFinancial';
import { applyFixedMonthlyCharges, buildFixedMonthlyCharges, competenceMonths } from './fixedMonthly';
import type { FinancialEntry } from './types';

function entry(partial: Partial<FinancialEntry> & Pick<FinancialEntry, 'id' | 'assignee_id' | 'shift_date' | 'sector_id'>): FinancialEntry {
  return {
    shift_id: partial.id,
    start_time: '07:00',
    end_time: '11:00',
    duration_hours: 4,
    sector_name: partial.sector_id === 'dia' ? 'Diaristas UTI' : partial.sector_id === 'uti' ? 'UTI Térreo' : 'Sem Setor',
    assignee_name: partial.assignee_id === 'thiago' ? 'THIAGO BUENO' : 'ANA SOUZA',
    assigned_value: 0,
    base_value: null,
    final_value: 0,
    value_source: 'zero_assigned',
    ...partial,
  };
}

const sectors = [
  { id: 'dia', name: 'Diaristas UTI' },
  { id: 'uti', name: 'UTI Térreo' },
];

describe('competenceMonths', () => {
  it('um mês, vários meses e virada de ano', () => {
    expect(competenceMonths('2026-09-01', '2026-09-30')).toEqual([{ year: 2026, month: 9 }]);
    expect(competenceMonths('2026-11-15', '2027-01-10')).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });
});

describe('buildFixedMonthlyCharges', () => {
  const thiagoShifts = [
    entry({ id: 'a', assignee_id: 'thiago', shift_date: '2026-09-01', sector_id: 'dia' }),
    entry({ id: 'b', assignee_id: 'thiago', shift_date: '2026-09-02', sector_id: 'dia' }),
    entry({ id: 'c', assignee_id: 'thiago', shift_date: '2026-09-03', sector_id: 'uti' }),
  ];

  it('uma vez por mês, independente da quantidade de plantões', () => {
    const charges = buildFixedMonthlyCharges({
      members: [{ user_id: 'thiago', name: 'THIAGO BUENO', monthly_value: 7000, sector_id: null }],
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      entries: thiagoShifts,
      sectors,
    });
    expect(charges).toEqual([
      { user_id: 'thiago', name: 'THIAGO BUENO', year: 2026, month: 9, value: 7000, sector_id: 'dia', sector_name: 'Diaristas UTI' },
    ]);
  });

  it('setor do cadastro tem prioridade; sem plantão no mês ainda cobra', () => {
    const charges = buildFixedMonthlyCharges({
      members: [{ user_id: 'thiago', name: 'THIAGO BUENO', monthly_value: 7000, sector_id: 'uti' }],
      startDate: '2026-09-01',
      endDate: '2026-10-31',
      entries: thiagoShifts,
      sectors,
    });
    expect(charges.map((c) => `${c.month}:${c.sector_id}:${c.value}`)).toEqual(['9:uti:7000', '10:uti:7000']);
  });

  it('valor zero ou vazio não gera cobrança', () => {
    expect(
      buildFixedMonthlyCharges({
        members: [{ user_id: 'x', name: 'X', monthly_value: 0, sector_id: null }],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        entries: [],
        sectors,
      }),
    ).toEqual([]);
  });
});

describe('applyFixedMonthlyCharges', () => {
  it('soma ao plantonista, ao setor e ao total sem mexer em plantões/horas', () => {
    const entries = [
      entry({ id: 'a', assignee_id: 'thiago', shift_date: '2026-09-01', sector_id: 'dia' }),
      entry({ id: 'b', assignee_id: 'ana', shift_date: '2026-09-01', sector_id: 'uti', final_value: 1200, assigned_value: 1200, value_source: 'assigned', duration_hours: 12 }),
    ];
    const agg = aggregateFinancial(entries);
    const charges = buildFixedMonthlyCharges({
      members: [{ user_id: 'thiago', name: 'THIAGO BUENO', monthly_value: 7000, sector_id: null }],
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      entries,
      sectors,
    });
    const result = applyFixedMonthlyCharges(agg, charges);

    expect(result.grandTotals.totalValue).toBe(8200);
    expect(result.grandTotals.totalShifts).toBe(2);
    expect(result.grandTotals.totalHours).toBe(16);

    const thiago = result.plantonistaReports.find((p) => p.assignee_id === 'thiago')!;
    expect(thiago.total_to_receive).toBe(7000);
    expect(thiago.fixed_monthly_total).toBe(7000);
    expect(thiago.total_shifts).toBe(1);

    const dia = result.sectorReports.find((s) => s.sector_id === 'dia')!;
    expect(dia.total_value).toBe(7000);
    expect(dia.plantonistas[0]).toMatchObject({ assignee_id: 'thiago', value: 7000, fixed: 7000 });

    // não altera o agregado original
    expect(agg.grandTotals.totalValue).toBe(1200);
  });

  it('cria o plantonista quando ele não teve plantão no período', () => {
    const agg = aggregateFinancial([]);
    const result = applyFixedMonthlyCharges(agg, [
      { user_id: 'viv', name: 'VIVIANE', year: 2026, month: 9, value: 2400, sector_id: null, sector_name: 'Sem Setor' },
    ]);
    expect(result.plantonistaReports).toHaveLength(1);
    expect(result.plantonistaReports[0]).toMatchObject({ total_shifts: 0, total_to_receive: 2400 });
    expect(result.grandTotals).toMatchObject({ totalValue: 2400, totalPlantonistas: 1 });
  });
});
