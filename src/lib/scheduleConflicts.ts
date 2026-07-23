// Detecção de conflitos de escala — fonte única usada pelo calendário e pelos relatórios.
// Conflito = mesmo plantonista atribuído a plantões que se SOBREPÕEM no mesmo dia.
// Horários que só se encostam (07:00-19:00 e 19:00-07:00) NÃO se sobrepõem.

export interface ConflictShiftSlot {
  shiftId: string;
  sectorName: string;
  startTime: string;
  endTime: string;
  assignmentId: string;
}

export interface DetectedConflict {
  id: string;
  userId: string;
  userName: string;
  date: string;
  shifts: ConflictShiftSlot[];
}

export interface ConflictShiftInput {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_id: string | null;
  hospital?: string | null;
}

export interface ConflictAssignmentInput {
  id: string;
  shift_id: string;
  user_id: string;
}

/** Gera um id estável do conflito (mesma lógica do calendário, p/ casar com reconhecidos). */
export function buildConflictKey(userId: string, date: string, conflictShifts: ConflictShiftSlot[]): string {
  const assignmentIds = conflictShifts
    .map((shift) => shift.assignmentId)
    .filter(Boolean)
    .sort();

  if (assignmentIds.length > 1) {
    return `${userId}_${date}_${assignmentIds.join('|')}`;
  }

  return `${userId}_${date}`;
}

/** Dois plantões se sobrepõem no mesmo dia? Encostar nas pontas (<) não conta como sobreposição. */
function shiftsOverlap(a: ConflictShiftSlot, b: ConflictShiftSlot): boolean {
  const aStart = parseInt(a.startTime.replace(':', ''), 10);
  const aEnd = parseInt(a.endTime.replace(':', ''), 10);
  const bStart = parseInt(b.startTime.replace(':', ''), 10);
  const bEnd = parseInt(b.endTime.replace(':', ''), 10);

  // Plantão que vira a noite: soma 2400 quando o fim é antes do início.
  const aEndAdj = aEnd <= aStart ? aEnd + 2400 : aEnd;
  const bEndAdj = bEnd <= bStart ? bEnd + 2400 : bEnd;

  return aStart < bEndAdj && bStart < aEndAdj;
}

export function detectScheduleConflicts(params: {
  assignments: ConflictAssignmentInput[];
  shiftById: Map<string, ConflictShiftInput>;
  getSectorName: (sectorId: string | null, hospital?: string | null) => string;
  getUserName: (userId: string) => string;
}): DetectedConflict[] {
  const { assignments, shiftById, getSectorName, getUserName } = params;
  const conflicts: DetectedConflict[] = [];

  // Agrupa por plantonista + data
  const byUserDate: Record<string, { userId: string; userName: string; date: string; shifts: ConflictShiftSlot[] }> = {};

  for (const assignment of assignments) {
    const shift = shiftById.get(assignment.shift_id);
    if (!shift) continue;

    const key = `${assignment.user_id}_${shift.shift_date}`;
    if (!byUserDate[key]) {
      byUserDate[key] = {
        userId: assignment.user_id,
        userName: getUserName(assignment.user_id),
        date: shift.shift_date,
        shifts: [],
      };
    }

    byUserDate[key].shifts.push({
      shiftId: shift.id,
      sectorName: getSectorName(shift.sector_id, shift.hospital),
      startTime: shift.start_time,
      endTime: shift.end_time,
      assignmentId: assignment.id,
    });
  }

  for (const data of Object.values(byUserDate)) {
    if (data.shifts.length <= 1) continue;

    const overlapping: ConflictShiftSlot[] = [];
    data.shifts.forEach((s1, i) => {
      const hasOverlap = data.shifts.some((s2, j) => i !== j && shiftsOverlap(s1, s2));
      if (hasOverlap && !overlapping.some((os) => os.shiftId === s1.shiftId)) {
        overlapping.push(s1);
      }
    });

    if (overlapping.length > 1) {
      conflicts.push({
        id: buildConflictKey(data.userId, data.date, overlapping),
        userId: data.userId,
        userName: data.userName,
        date: data.date,
        shifts: overlapping,
      });
    }
  }

  return conflicts;
}
