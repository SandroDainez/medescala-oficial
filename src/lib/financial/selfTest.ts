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

  // Seed (as specified by the task):
  // A: setor X, João, assigned 500
  // B: setor X, João, no assigned, but default/base 400
  // C: setor Y, Maria, no assigned and no default
  const sectorX: SectorLookup = { id: 'sector-x', name: 'Setor X' };
  const sectorY: SectorLookup = { id: 'sector-y', name: 'Setor Y' };

  const shifts: ScheduleShift[] = [
    {
      id: 'shift-a',
      shift_date: '2025-01-10',
      start_time: '07:00',
      end_time: '19:00',
      sector_id: sectorX.id,
      base_value: 400, // default of sector X
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
      start_time: '07:00',
      end_time: '19:00',
      sector_id: sectorY.id,
      base_value: null,
      title: 'Plantão C',
      hospital: 'H',
    },
  ];

  const assignments: ScheduleAssignment[] = [
    { id: 'a1', shift_id: 'shift-a', user_id: 'joao', assigned_value: 500, profile_name: 'João' },
    { id: 'a2', shift_id: 'shift-b', user_id: 'joao', assigned_value: null, profile_name: 'João' },
    { id: 'a3', shift_id: 'shift-c', user_id: 'maria', assigned_value: null, profile_name: 'Maria' },
  ];

  const entries = mapScheduleToFinancialEntries({
    shifts,
    assignments,
    sectors: [sectorX, sectorY],
  });

  const { grandTotals, plantonistaReports, sectorReports } = aggregateFinancial(entries);

  // Expected
  if (grandTotals.totalValue !== 900) errors.push(`Total Geral esperado 900, veio ${grandTotals.totalValue}`);
  if (grandTotals.unpricedShifts !== 1) errors.push(`Sem valor esperado 1, veio ${grandTotals.unpricedShifts}`);

  const joao = plantonistaReports.find((p) => p.assignee_id === 'joao');
  const maria = plantonistaReports.find((p) => p.assignee_id === 'maria');

  if (!joao) errors.push('João não encontrado');
  else {
    if (joao.total_to_receive !== 900) errors.push(`João total esperado 900, veio ${joao.total_to_receive}`);
  }

  if (!maria) errors.push('Maria não encontrada');
  else {
    if (maria.total_to_receive !== 0) errors.push(`Maria total esperado 0, veio ${maria.total_to_receive}`);
    if (maria.unpriced_shifts !== 1) errors.push(`Maria unpriced esperado 1, veio ${maria.unpriced_shifts}`);
  }

  const setorXReport = sectorReports.find((s) => s.sector_id === sectorX.id);
  const setorYReport = sectorReports.find((s) => s.sector_id === sectorY.id);

  if (!setorXReport) errors.push('Setor X não encontrado');
  else {
    if (setorXReport.total_value !== 900) errors.push(`Setor X total esperado 900, veio ${setorXReport.total_value}`);
  }

  if (!setorYReport) errors.push('Setor Y não encontrado');
  else {
    if (setorYReport.total_value !== 0) errors.push(`Setor Y total esperado 0, veio ${setorYReport.total_value}`);
    if (setorYReport.unpriced_shifts !== 1) errors.push(`Setor Y sem valor esperado 1, veio ${setorYReport.unpriced_shifts}`);
  }

  return { ok: errors.length === 0, errors };
}
