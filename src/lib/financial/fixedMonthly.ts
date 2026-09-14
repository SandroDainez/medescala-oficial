// Valor mensal fixo — profissional pago por mês (valor único), não por plantão.
// Ex.: diaristas de UTI e nefrologista que passam visita.
//
// Regras (valem para Financeiro, Relatórios, Dashboard, Rentabilidade e visão do plantonista):
// - Os plantões dessas pessoas continuam como plantões (contagem/horas intactas); o valor
//   fixo NÃO vira plantão.
// - Soma UMA vez por mês de competência que tenha algum dia dentro do período consultado,
//   independentemente da quantidade de plantões (inclusive zero).
// - Setor do custo: o escolhido no cadastro; se vazio, o setor com mais plantões da pessoa
//   naquele mês; se não houver plantão no mês, o setor com mais plantões no período.

import type { PlantonistaReport, SectorReport, aggregateFinancial } from '@/lib/financial/aggregateFinancial';
import type { FinancialEntry } from '@/lib/financial/types';

export interface FixedMonthlyMember {
  user_id: string;
  name: string;
  monthly_value: number;
  /** Setor escolhido no cadastro; null = automático. */
  sector_id: string | null;
}

export interface FixedMonthlyCharge {
  user_id: string;
  name: string;
  year: number;
  month: number;
  value: number;
  sector_id: string | null;
  sector_name: string;
}

export function competenceMonths(startDate: string, endDate: string): Array<{ year: number; month: number }> {
  const sy = Number(startDate.slice(0, 4));
  const sm = Number(startDate.slice(5, 7));
  const ey = Number(endDate.slice(0, 4));
  const em = Number(endDate.slice(5, 7));
  if (![sy, sm, ey, em].every(Number.isFinite)) return [];

  const out: Array<{ year: number; month: number }> = [];
  let year = sy;
  let month = sm;
  while (year * 100 + month <= ey * 100 + em && out.length < 1200) {
    out.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function sectorWithMostShifts(
  entries: FinancialEntry[],
  userId: string,
  sectorName: Map<string, string>,
  datePrefix?: string,
): string | null {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.assignee_id !== userId || !e.sector_id) continue;
    if (datePrefix && !e.shift_date.startsWith(datePrefix)) continue;
    counts.set(e.sector_id, (counts.get(e.sector_id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    const tieBreak = best !== null && count === bestCount && (sectorName.get(id) ?? '').localeCompare(sectorName.get(best) ?? '', 'pt-BR') < 0;
    if (count > bestCount || tieBreak) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

export function buildFixedMonthlyCharges(params: {
  members: FixedMonthlyMember[];
  startDate: string;
  endDate: string;
  /** Lançamentos de plantão do período (de todos os setores), usados só para escolher o setor automático. */
  entries: FinancialEntry[];
  sectors: Array<{ id: string; name: string }>;
}): FixedMonthlyCharge[] {
  const months = competenceMonths(params.startDate, params.endDate);
  const sectorName = new Map(params.sectors.map((s) => [s.id, s.name]));
  const charges: FixedMonthlyCharge[] = [];

  for (const member of params.members) {
    if (!(member.monthly_value > 0)) continue;
    for (const { year, month } of months) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const sectorId =
        member.sector_id ??
        sectorWithMostShifts(params.entries, member.user_id, sectorName, prefix) ??
        sectorWithMostShifts(params.entries, member.user_id, sectorName);
      charges.push({
        user_id: member.user_id,
        name: member.name,
        year,
        month,
        value: member.monthly_value,
        sector_id: sectorId,
        sector_name: sectorId ? sectorName.get(sectorId) ?? 'Sem Setor' : 'Sem Setor',
      });
    }
  }
  return charges;
}

type FinancialAggregate = ReturnType<typeof aggregateFinancial>;

/** Soma os valores mensais fixos aos totais já agregados (sem alterar contagem de plantões/horas). */
export function applyFixedMonthlyCharges(agg: FinancialAggregate, charges: FixedMonthlyCharge[]): FinancialAggregate {
  if (charges.length === 0) return agg;

  const plantonistas = new Map<string, PlantonistaReport>(
    agg.plantonistaReports.map((p) => [p.assignee_id, { ...p, sectors: p.sectors.map((s) => ({ ...s })) }]),
  );
  const sectors = new Map<string, SectorReport>(
    agg.sectorReports.map((s) => [s.sector_id ?? 'sem-setor', { ...s, plantonistas: s.plantonistas.map((x) => ({ ...x })) }]),
  );
  let added = 0;

  for (const c of charges) {
    added += c.value;

    let p = plantonistas.get(c.user_id);
    if (!p) {
      p = {
        assignee_id: c.user_id,
        assignee_name: c.name,
        total_shifts: 0,
        total_hours: 0,
        paid_shifts: 0,
        unpriced_shifts: 0,
        total_to_receive: 0,
        sectors: [],
        entries: [],
      };
      plantonistas.set(c.user_id, p);
    }
    p.total_to_receive += c.value;
    p.fixed_monthly_total = (p.fixed_monthly_total ?? 0) + c.value;

    let ps = p.sectors.find((s) => (s.sector_id ?? null) === c.sector_id);
    if (!ps) {
      ps = {
        sector_id: c.sector_id,
        sector_name: c.sector_name,
        sector_shifts: 0,
        sector_hours: 0,
        sector_paid: 0,
        sector_unpriced: 0,
        sector_total: 0,
      };
      p.sectors.push(ps);
      p.sectors.sort((a, b) => a.sector_name.localeCompare(b.sector_name));
    }
    ps.sector_total += c.value;
    ps.sector_fixed = (ps.sector_fixed ?? 0) + c.value;

    const sectorKey = c.sector_id ?? 'sem-setor';
    let s = sectors.get(sectorKey);
    if (!s) {
      s = {
        sector_id: c.sector_id,
        sector_name: c.sector_name,
        total_shifts: 0,
        total_hours: 0,
        paid_shifts: 0,
        unpriced_shifts: 0,
        total_value: 0,
        plantonistas: [],
      };
      sectors.set(sectorKey, s);
    }
    s.total_value += c.value;
    s.fixed_monthly_total = (s.fixed_monthly_total ?? 0) + c.value;

    let sp = s.plantonistas.find((x) => x.assignee_id === c.user_id);
    if (!sp) {
      sp = { assignee_id: c.user_id, assignee_name: c.name, shifts: 0, hours: 0, paid: 0, unpriced: 0, value: 0 };
      s.plantonistas.push(sp);
      s.plantonistas.sort((a, b) => a.assignee_name.localeCompare(b.assignee_name));
    }
    sp.value += c.value;
    sp.fixed = (sp.fixed ?? 0) + c.value;
  }

  const plantonistaReports = Array.from(plantonistas.values()).sort((a, b) => a.assignee_name.localeCompare(b.assignee_name));
  const sectorReports = Array.from(sectors.values()).sort((a, b) => a.sector_name.localeCompare(b.sector_name));

  return {
    grandTotals: {
      ...agg.grandTotals,
      totalValue: agg.grandTotals.totalValue + added,
      totalPlantonistas: plantonistaReports.length,
    },
    plantonistaReports,
    sectorReports,
  };
}
