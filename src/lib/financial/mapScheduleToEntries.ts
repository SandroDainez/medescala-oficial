import type {
  FinancialEntry,
  ScheduleAssignment,
  ScheduleShift,
  SectorLookup,
} from '@/lib/financial/types';

function calculateDurationHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  let hours = endH - startH;
  let minutes = endM - startM;
  if (hours < 0 || (hours === 0 && minutes < 0)) {
    hours += 24;
  }
  return hours + minutes / 60;
}

function normalizeMoney(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Accept "800", "800.00", "800,00", "1.234,56"
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

/**
 * Determines if a shift is a night shift based on start time.
 * Night shifts typically start at 19:00 or later, or before 07:00.
 */
function isNightShift(startTime: string): boolean {
  if (!startTime) return false;
  const [hour] = startTime.split(':').map(Number);
  return hour >= 19 || hour < 7;
}

export function getFinalValue(
  assigned_value: unknown,
  base_value: unknown,
  sector_default_value: number | null = null
): { final_value: number | null; source: 'assigned' | 'base' | 'sector_default' | 'none' | 'invalid'; invalidReason?: string } {
  const assigned = normalizeMoney(assigned_value);
  const base = normalizeMoney(base_value);
  const sectorDefault = sector_default_value !== null && sector_default_value > 0 ? sector_default_value : null;

  // Negative or NaN should be excluded and audited.
  if (assigned !== null && assigned < 0) return { final_value: null, source: 'invalid', invalidReason: 'assigned_value negativo' };
  if (base !== null && base < 0) return { final_value: null, source: 'invalid', invalidReason: 'base_value negativo' };

  // Priority: assigned_value > 0, then base_value > 0, then sector default
  if (assigned !== null && assigned > 0) return { final_value: assigned, source: 'assigned' };
  if (base !== null && base > 0) return { final_value: base, source: 'base' };
  if (sectorDefault !== null) return { final_value: sectorDefault, source: 'sector_default' };
  
  return { final_value: null, source: 'none' };
}

/**
 * Check if a sector is a training sector (residentes/estagiários) that should have no remuneration.
 * This is specific to GABS tenant.
 */
function isTrainingSector(sectorName: string): boolean {
  const normalized = sectorName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized.includes('residente') || normalized.includes('estagiario');
}

export function mapScheduleToFinancialEntries(params: {
  shifts: ScheduleShift[];
  assignments: ScheduleAssignment[];
  sectors?: SectorLookup[];
  /** When a shift has no assignee, we still include it as a row grouped under this id */
  unassignedLabel?: { id: string; name: string };
  /** Tenant slug - used for tenant-specific rules (e.g., GABS training sectors have no remuneration) */
  tenantSlug?: string;
}): FinancialEntry[] {
  const unassigned = params.unassignedLabel ?? { id: 'unassigned', name: 'Vago' };

  // Build sector lookup maps
  const sectorNameById = new Map<string, string>();
  const sectorDefaultDayById = new Map<string, number | null>();
  const sectorDefaultNightById = new Map<string, number | null>();
  
  (params.sectors ?? []).forEach((s) => {
    sectorNameById.set(s.id, s.name);
    sectorDefaultDayById.set(s.id, s.default_day_value ?? null);
    sectorDefaultNightById.set(s.id, s.default_night_value ?? null);
  });

  const assignmentsByShift = new Map<string, ScheduleAssignment[]>();
  for (const a of params.assignments) {
    if (!assignmentsByShift.has(a.shift_id)) assignmentsByShift.set(a.shift_id, []);
    assignmentsByShift.get(a.shift_id)!.push(a);
  }

  const entries: FinancialEntry[] = [];

  // GABS-specific rule: training sectors (residentes/estagiários) have no remuneration
  const isGabs = params.tenantSlug?.toLowerCase() === 'gabs';

  for (const shift of params.shifts) {
    const duration_hours = calculateDurationHours(shift.start_time, shift.end_time);
    const sector_name = shift.sector_id ? sectorNameById.get(shift.sector_id) ?? 'Sem Setor' : 'Sem Setor';

    // Get sector default values for fallback
    const isNight = isNightShift(shift.start_time);
    const sectorDefaultValue = shift.sector_id 
      ? (isNight 
          ? sectorDefaultNightById.get(shift.sector_id) 
          : sectorDefaultDayById.get(shift.sector_id)
        ) ?? null
      : null;

    // Check if this is a training sector in GABS (no remuneration)
    const noRemuneration = isGabs && isTrainingSector(sector_name);

    const shiftAssignments = assignmentsByShift.get(shift.id) ?? [];

    // If no assignment exists, still emit one row (so totals match the Escala list)
    if (shiftAssignments.length === 0) {
      // IMPORTANT: do not apply base_value as money when there is no assignee (prevents inflating financial totals).
      entries.push({
        id: shift.id,
        shift_id: shift.id,
        shift_date: shift.shift_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        duration_hours,
        sector_id: shift.sector_id,
        sector_name,
        assignee_id: unassigned.id,
        assignee_name: unassigned.name,
        title: shift.title ?? null,
        hospital: shift.hospital ?? null,
        assigned_value: null,
        base_value: shift.base_value ?? null,
        final_value: null,
        value_source: 'none',
      });
      continue;
    }

    for (const a of shiftAssignments) {
      // For GABS training sectors, always return no value
      // Otherwise use priority: assigned_value > base_value > sector_default
      const valueResult = noRemuneration 
        ? { final_value: null, source: 'none' as const, invalidReason: undefined }
        : getFinalValue(a.assigned_value, shift.base_value, sectorDefaultValue);

      entries.push({
        id: a.id,
        shift_id: shift.id,
        shift_date: shift.shift_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        duration_hours,
        sector_id: shift.sector_id,
        sector_name,
        assignee_id: a.user_id,
        assignee_name: a.profile_name ?? 'Sem nome',
        title: shift.title ?? null,
        hospital: shift.hospital ?? null,
        assigned_value: noRemuneration ? null : a.assigned_value,
        base_value: noRemuneration ? null : (shift.base_value ?? null),
        final_value: valueResult.final_value,
        value_source: valueResult.source,
        value_invalid_reason: valueResult.invalidReason,
      });
    }
  }

  // Stable ordering
  entries.sort((a, b) => {
    const d = a.shift_date.localeCompare(b.shift_date);
    if (d !== 0) return d;
    const t = a.start_time.localeCompare(b.start_time);
    if (t !== 0) return t;
    return a.assignee_name.localeCompare(b.assignee_name);
  });

  return entries;
}
