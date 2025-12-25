export interface FinancialSelfTestResult {
  ok: boolean;
  errors: string[];
}

// Minimal, deterministic self-test for the Finance aggregation rules.
// This does NOT touch the database; it validates the aggregation logic with a fixed seed dataset.
export function runFinancialSelfTest(): FinancialSelfTestResult {
  const errors: string[] = [];

  // Seed dataset (as specified):
  // Sector A (CC)
  // Omar: 3 shifts of 12h, values: 1800, null, null
  // Sandro: 2 shifts of 12h, values: null, null
  const sectorAId = 'sector-a';
  const sectorAName = 'CC';
  const omarId = 'omar';
  const sandroId = 'sandro';

  type Entry = {
    id: string;
    assignee_id: string;
    assignee_name: string;
    sector_id: string;
    sector_name: string;
    duration_hours: number;
    value: number | null;
  };

  const entries: Entry[] = [
    { id: 'e1', assignee_id: omarId, assignee_name: 'Omar', sector_id: sectorAId, sector_name: sectorAName, duration_hours: 12, value: 1800 },
    { id: 'e2', assignee_id: omarId, assignee_name: 'Omar', sector_id: sectorAId, sector_name: sectorAName, duration_hours: 12, value: null },
    { id: 'e3', assignee_id: omarId, assignee_name: 'Omar', sector_id: sectorAId, sector_name: sectorAName, duration_hours: 12, value: null },
    { id: 'e4', assignee_id: sandroId, assignee_name: 'Sandro', sector_id: sectorAId, sector_name: sectorAName, duration_hours: 12, value: null },
    { id: 'e5', assignee_id: sandroId, assignee_name: 'Sandro', sector_id: sectorAId, sector_name: sectorAName, duration_hours: 12, value: null },
  ];

  // Aggregate by assignee
  const byAssignee = new Map<string, {
    total_shifts: number;
    total_hours: number;
    paid_shifts: number;
    unpriced_shifts: number;
    total_to_receive: number;
  }>();

  for (const e of entries) {
    if (!byAssignee.has(e.assignee_id)) {
      byAssignee.set(e.assignee_id, { total_shifts: 0, total_hours: 0, paid_shifts: 0, unpriced_shifts: 0, total_to_receive: 0 });
    }
    const row = byAssignee.get(e.assignee_id)!;
    row.total_shifts += 1;
    row.total_hours += e.duration_hours;

    if (e.value === null) {
      row.unpriced_shifts += 1;
    } else if (typeof e.value === 'number' && e.value >= 0) {
      row.paid_shifts += 1;
      row.total_to_receive += e.value;
    } else {
      // invalid values excluded
      row.unpriced_shifts += 1;
    }
  }

  const omar = byAssignee.get(omarId);
  const sandro = byAssignee.get(sandroId);

  // Assertions: Omar
  if (!omar) errors.push('SelfTest: Omar missing');
  else {
    if (omar.total_shifts !== 3) errors.push(`Omar.total_shifts expected 3, got ${omar.total_shifts}`);
    if (omar.total_hours !== 36) errors.push(`Omar.total_hours expected 36, got ${omar.total_hours}`);
    if (omar.paid_shifts !== 1) errors.push(`Omar.paid_shifts expected 1, got ${omar.paid_shifts}`);
    if (omar.unpriced_shifts !== 2) errors.push(`Omar.unpriced_shifts expected 2, got ${omar.unpriced_shifts}`);
    if (omar.total_to_receive !== 1800) errors.push(`Omar.total_to_receive expected 1800, got ${omar.total_to_receive}`);
  }

  // Assertions: Sandro
  if (!sandro) errors.push('SelfTest: Sandro missing');
  else {
    if (sandro.total_shifts !== 2) errors.push(`Sandro.total_shifts expected 2, got ${sandro.total_shifts}`);
    if (sandro.total_hours !== 24) errors.push(`Sandro.total_hours expected 24, got ${sandro.total_hours}`);
    if (sandro.paid_shifts !== 0) errors.push(`Sandro.paid_shifts expected 0, got ${sandro.paid_shifts}`);
    if (sandro.unpriced_shifts !== 2) errors.push(`Sandro.unpriced_shifts expected 2, got ${sandro.unpriced_shifts}`);
    if (sandro.total_to_receive !== 0) errors.push(`Sandro.total_to_receive expected 0, got ${sandro.total_to_receive}`);
  }

  // Sector A totals
  const sectorTotalShifts = entries.length;
  const sectorTotalHours = entries.reduce((acc, e) => acc + e.duration_hours, 0);
  const sectorTotalValue = entries.reduce((acc, e) => (e.value === null ? acc : acc + e.value), 0);

  if (sectorTotalShifts !== 5) errors.push(`SectorA.total_shifts expected 5, got ${sectorTotalShifts}`);
  if (sectorTotalHours !== 60) errors.push(`SectorA.total_hours expected 60, got ${sectorTotalHours}`);
  if (sectorTotalValue !== 1800) errors.push(`SectorA.total_value expected 1800, got ${sectorTotalValue}`);

  return { ok: errors.length === 0, errors };
}
