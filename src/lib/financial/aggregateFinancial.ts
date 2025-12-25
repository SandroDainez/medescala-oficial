import type { AuditInfo, FinancialEntry } from '@/lib/financial/types';

export type PlantonistaReport = {
  assignee_id: string;
  assignee_name: string;
  total_shifts: number;
  total_hours: number;
  paid_shifts: number;
  unpriced_shifts: number;
  total_to_receive: number;
  sectors: {
    sector_id: string | null;
    sector_name: string;
    sector_shifts: number;
    sector_hours: number;
    sector_paid: number;
    sector_unpriced: number;
    sector_total: number;
  }[];
  entries: FinancialEntry[];
};

export type SectorReport = {
  sector_id: string | null;
  sector_name: string;
  total_shifts: number;
  total_hours: number;
  paid_shifts: number;
  unpriced_shifts: number;
  total_value: number;
  plantonistas: {
    assignee_id: string;
    assignee_name: string;
    shifts: number;
    hours: number;
    paid: number;
    unpriced: number;
    value: number;
  }[];
};

export function buildAuditInfo(entries: FinancialEntry[]): AuditInfo {
  let withValue = 0;
  let withoutValue = 0;
  let invalidValue = 0;
  const includedIds: string[] = [];
  const sumDetails: { id: string; assignee_name: string; final_value: number }[] = [];
  let finalSum = 0;

  for (const e of entries) {
    if (e.value_source === 'invalid') {
      invalidValue++;
      continue;
    }
    if (e.final_value === null) {
      withoutValue++;
      continue;
    }
    withValue++;
    includedIds.push(e.id);
    sumDetails.push({ id: e.id, assignee_name: e.assignee_name, final_value: e.final_value });
    finalSum += e.final_value;
  }

  return {
    totalLoaded: entries.length,
    withValue,
    withoutValue,
    invalidValue,
    includedIds,
    sumDetails,
    finalSum,
  };
}

export function aggregateFinancial(entries: FinancialEntry[]) {
  // GRAND TOTALS
  let totalShifts = 0;
  let totalHours = 0;
  let paidShifts = 0;
  let unpricedShifts = 0;
  let totalValue = 0;

  for (const e of entries) {
    totalShifts++;
    totalHours += e.duration_hours;

    if (e.value_source === 'invalid') {
      unpricedShifts++;
      continue;
    }

    if (e.final_value === null) {
      unpricedShifts++;
      continue;
    }

    paidShifts++;
    totalValue += e.final_value;
  }

  // POR PLANTONISTA
  const byPlantonista = new Map<string, PlantonistaReport>();
  for (const e of entries) {
    if (!byPlantonista.has(e.assignee_id)) {
      byPlantonista.set(e.assignee_id, {
        assignee_id: e.assignee_id,
        assignee_name: e.assignee_name,
        total_shifts: 0,
        total_hours: 0,
        paid_shifts: 0,
        unpriced_shifts: 0,
        total_to_receive: 0,
        sectors: [],
        entries: [],
      });
    }

    const p = byPlantonista.get(e.assignee_id)!;
    p.total_shifts++;
    p.total_hours += e.duration_hours;
    p.entries.push(e);

    if (e.value_source !== 'invalid' && e.final_value !== null) {
      p.paid_shifts++;
      p.total_to_receive += e.final_value;
    } else {
      p.unpriced_shifts++;
    }
  }

  // Sector subtotals inside each plantonista
  for (const p of byPlantonista.values()) {
    const sectorMap = new Map<string, PlantonistaReport['sectors'][number]>();
    for (const e of p.entries) {
      const key = e.sector_id ?? 'sem-setor';
      if (!sectorMap.has(key)) {
        sectorMap.set(key, {
          sector_id: e.sector_id,
          sector_name: e.sector_name,
          sector_shifts: 0,
          sector_hours: 0,
          sector_paid: 0,
          sector_unpriced: 0,
          sector_total: 0,
        });
      }
      const s = sectorMap.get(key)!;
      s.sector_shifts++;
      s.sector_hours += e.duration_hours;
      if (e.value_source !== 'invalid' && e.final_value !== null) {
        s.sector_paid++;
        s.sector_total += e.final_value;
      } else {
        s.sector_unpriced++;
      }
    }
    p.sectors = Array.from(sectorMap.values()).sort((a, b) => a.sector_name.localeCompare(b.sector_name));
  }

  const plantonistaReports = Array.from(byPlantonista.values()).sort((a, b) => a.assignee_name.localeCompare(b.assignee_name));

  // POR SETOR
  const bySector = new Map<string, SectorReport>();
  for (const e of entries) {
    const key = e.sector_id ?? 'sem-setor';
    if (!bySector.has(key)) {
      bySector.set(key, {
        sector_id: e.sector_id,
        sector_name: e.sector_name,
        total_shifts: 0,
        total_hours: 0,
        paid_shifts: 0,
        unpriced_shifts: 0,
        total_value: 0,
        plantonistas: [],
      });
    }

    const s = bySector.get(key)!;
    s.total_shifts++;
    s.total_hours += e.duration_hours;

    if (e.value_source !== 'invalid' && e.final_value !== null) {
      s.paid_shifts++;
      s.total_value += e.final_value;
    } else {
      s.unpriced_shifts++;
    }
  }

  for (const [sectorKey, s] of bySector.entries()) {
    const pMap = new Map<string, SectorReport['plantonistas'][number]>();
    for (const e of entries) {
      const key = e.sector_id ?? 'sem-setor';
      if (key !== sectorKey) continue;
      if (!pMap.has(e.assignee_id)) {
        pMap.set(e.assignee_id, {
          assignee_id: e.assignee_id,
          assignee_name: e.assignee_name,
          shifts: 0,
          hours: 0,
          paid: 0,
          unpriced: 0,
          value: 0,
        });
      }
      const p = pMap.get(e.assignee_id)!;
      p.shifts++;
      p.hours += e.duration_hours;
      if (e.value_source !== 'invalid' && e.final_value !== null) {
        p.paid++;
        p.value += e.final_value;
      } else {
        p.unpriced++;
      }
    }
    s.plantonistas = Array.from(pMap.values()).sort((a, b) => a.assignee_name.localeCompare(b.assignee_name));
  }

  const sectorReports = Array.from(bySector.values()).sort((a, b) => a.sector_name.localeCompare(b.sector_name));

  return {
    grandTotals: {
      totalShifts,
      totalHours,
      paidShifts,
      unpricedShifts,
      totalValue,
      totalPlantonistas: plantonistaReports.length,
    },
    plantonistaReports,
    sectorReports,
  };
}
