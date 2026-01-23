import { aggregateFinancial } from '@/lib/financial/aggregateFinancial';
import { mapScheduleToFinancialEntries } from '@/lib/financial/mapScheduleToEntries';
import type { ScheduleAssignment, ScheduleShift, SectorLookup } from '@/lib/financial/types';

export interface FinancialSelfTestResult {
  ok: boolean;
  errors: string[];
}

// Deterministic self-test for mapping + aggregation rules.
// Does NOT touch the database.
export function runFinancialSelfTest(): FinancialSelfTestResult {
  const errors: string[] = [];

  // Test scenarios:
  // A: setor X, João, assigned 500 (uses assigned)
  // B: setor X, João, no assigned, base 400 (uses base)
  // C: setor Y, Maria, no assigned and no base (uses sector default night 300)
  // D: setor Z, Pedro, no assigned, no base, no sector default (unpriced)
  const sectorX: SectorLookup = { id: 'sector-x', name: 'Setor X', default_day_value: 400, default_night_value: 350 };
  const sectorY: SectorLookup = { id: 'sector-y', name: 'Setor Y', default_day_value: null, default_night_value: 300 };
  const sectorZ: SectorLookup = { id: 'sector-z', name: 'Setor Z', default_day_value: null, default_night_value: null };

  const shifts: ScheduleShift[] = [
    {
      id: 'shift-a',
      shift_date: '2025-01-10',
      start_time: '07:00',
      end_time: '19:00',
      sector_id: sectorX.id,
      base_value: 400, // explicit base value
      title: 'Plantão A',
      hospital: 'H',
    },
    {
      id: 'shift-b',
      shift_date: '2025-01-11',
      start_time: '07:00',
      end_time: '19:00',
      sector_id: sectorX.id,
      base_value: 400,
      title: 'Plantão B',
      hospital: 'H',
    },
    {
      id: 'shift-c',
      shift_date: '2025-01-12',
      start_time: '19:00', // NIGHT shift - should use default_night_value
      end_time: '07:00',
      sector_id: sectorY.id,
      base_value: null, // no base, should fallback to sector default
      title: 'Plantão C',
      hospital: 'H',
    },
    {
      id: 'shift-d',
      shift_date: '2025-01-13',
      start_time: '07:00',
      end_time: '19:00',
      sector_id: sectorZ.id,
      base_value: null, // no base, no sector default = unpriced
      title: 'Plantão D',
      hospital: 'H',
    },
  ];

  const assignments: ScheduleAssignment[] = [
    { id: 'a1', shift_id: 'shift-a', user_id: 'joao', assigned_value: 500, profile_name: 'João' },
    { id: 'a2', shift_id: 'shift-b', user_id: 'joao', assigned_value: null, profile_name: 'João' },
    { id: 'a3', shift_id: 'shift-c', user_id: 'maria', assigned_value: null, profile_name: 'Maria' },
    { id: 'a4', shift_id: 'shift-d', user_id: 'pedro', assigned_value: null, profile_name: 'Pedro' },
  ];

  const entries = mapScheduleToFinancialEntries({
    shifts,
    assignments,
    sectors: [sectorX, sectorY, sectorZ],
  });

  const { grandTotals, plantonistaReports, sectorReports } = aggregateFinancial(entries);

  // Expected totals:
  // João: 500 + 400 = 900
  // Maria: 300 (sector default night)
  // Pedro: 0 (unpriced)
  // Total: 1200
  if (grandTotals.totalValue !== 1200) errors.push(`Total Geral esperado 1200, veio ${grandTotals.totalValue}`);
  if (grandTotals.unpricedShifts !== 1) errors.push(`Sem valor esperado 1, veio ${grandTotals.unpricedShifts}`);
  if (grandTotals.paidShifts !== 3) errors.push(`Com valor esperado 3, veio ${grandTotals.paidShifts}`);

  const joao = plantonistaReports.find((p) => p.assignee_id === 'joao');
  const maria = plantonistaReports.find((p) => p.assignee_id === 'maria');
  const pedro = plantonistaReports.find((p) => p.assignee_id === 'pedro');

  if (!joao) errors.push('João não encontrado');
  else {
    if (joao.total_to_receive !== 900) errors.push(`João total esperado 900, veio ${joao.total_to_receive}`);
  }

  if (!maria) errors.push('Maria não encontrada');
  else {
    if (maria.total_to_receive !== 300) errors.push(`Maria total esperado 300 (sector default), veio ${maria.total_to_receive}`);
    if (maria.unpriced_shifts !== 0) errors.push(`Maria unpriced esperado 0, veio ${maria.unpriced_shifts}`);
  }

  if (!pedro) errors.push('Pedro não encontrado');
  else {
    if (pedro.total_to_receive !== 0) errors.push(`Pedro total esperado 0, veio ${pedro.total_to_receive}`);
    if (pedro.unpriced_shifts !== 1) errors.push(`Pedro unpriced esperado 1, veio ${pedro.unpriced_shifts}`);
  }

  const setorXReport = sectorReports.find((s) => s.sector_id === sectorX.id);
  const setorYReport = sectorReports.find((s) => s.sector_id === sectorY.id);
  const setorZReport = sectorReports.find((s) => s.sector_id === sectorZ.id);

  if (!setorXReport) errors.push('Setor X não encontrado');
  else {
    if (setorXReport.total_value !== 900) errors.push(`Setor X total esperado 900, veio ${setorXReport.total_value}`);
  }

  if (!setorYReport) errors.push('Setor Y não encontrado');
  else {
    if (setorYReport.total_value !== 300) errors.push(`Setor Y total esperado 300, veio ${setorYReport.total_value}`);
    if (setorYReport.unpriced_shifts !== 0) errors.push(`Setor Y sem valor esperado 0, veio ${setorYReport.unpriced_shifts}`);
  }

  if (!setorZReport) errors.push('Setor Z não encontrado');
  else {
    if (setorZReport.total_value !== 0) errors.push(`Setor Z total esperado 0, veio ${setorZReport.total_value}`);
    if (setorZReport.unpriced_shifts !== 1) errors.push(`Setor Z sem valor esperado 1, veio ${setorZReport.unpriced_shifts}`);
  }

  return { ok: errors.length === 0, errors };
}
