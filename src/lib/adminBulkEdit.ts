export interface BulkApplyFormData {
  title: string;
  start_time: string;
  end_time: string;
  base_value: string;
  assigned_user_id: string;
}

export interface BulkEditDraftShift {
  id: string;
  hospital: string;
  location: string;
  start_time: string;
  end_time: string;
  base_value: string;
  notes: string;
  sector_id: string;
  assigned_user_id: string;
}

export interface BulkEditShiftUpdateInput {
  hospital: string;
  location: string;
  start_time: string;
  end_time: string;
  base_value: string;
  notes: string;
  sector_id: string;
}

export interface BulkEditMovementShiftContext {
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_id: string | null;
  hospital: string;
}

export interface BulkApplyTargetShift {
  id: string;
  sector_id: string | null;
  start_time: string;
  end_time: string;
}

export type BulkEditAssignmentMode = 'keep' | 'available' | 'vacant' | 'user';

export function hasBulkApplyChanges(data: BulkApplyFormData) {
  return Boolean(
    data.title.trim() ||
      data.start_time ||
      data.end_time ||
      data.base_value.trim() ||
      data.assigned_user_id,
  );
}

export function buildBulkShiftUpdatePayload(
  data: Pick<BulkApplyFormData, 'title' | 'start_time' | 'end_time'>,
  updatedBy: string,
) {
  const payload: {
    updated_by: string;
    title?: string;
    start_time?: string;
    end_time?: string;
  } = {
    updated_by: updatedBy,
  };

  if (data.title.trim()) payload.title = data.title.trim();
  if (data.start_time) payload.start_time = data.start_time;
  if (data.end_time) payload.end_time = data.end_time;

  return payload;
}

export function createBulkEditDrafts<TShift extends {
  id: string;
  hospital: string;
  location: string | null;
  start_time: string;
  end_time: string;
  base_value: number | null;
  notes: string | null;
  sector_id: string | null;
}>(
  dayShifts: TShift[],
  formatMoneyInput: (value: number | null | undefined) => string,
): BulkEditDraftShift[] {
  return dayShifts.map((shift) => ({
    id: shift.id,
    hospital: shift.hospital,
    location: shift.location || '',
    start_time: shift.start_time.slice(0, 5),
    end_time: shift.end_time.slice(0, 5),
    base_value: formatMoneyInput(shift.base_value),
    notes: shift.notes || '',
    sector_id: shift.sector_id || '',
    assigned_user_id: '__keep__',
  }));
}

export function getBulkApplyEffectiveTimes(
  data: Pick<BulkApplyFormData, 'start_time' | 'end_time'>,
  shift: Pick<BulkApplyTargetShift, 'start_time' | 'end_time'>,
) {
  return {
    start_time: data.start_time || shift.start_time.slice(0, 5),
    end_time: data.end_time || shift.end_time.slice(0, 5),
  };
}

export function collectBulkApplyTargetShifts<TShift extends BulkApplyTargetShift>(
  shiftIds: string[],
  shifts: TShift[],
) {
  const selected = shiftIds
    .map((shiftId) => shifts.find((shift) => shift.id === shiftId))
    .filter(Boolean) as TShift[];

  return {
    selected,
    byId: new Map(selected.map((shift) => [shift.id, shift])),
  };
}

export function findInvalidBulkAssigneeShift<TShift extends Pick<BulkApplyTargetShift, 'sector_id'>>(
  shifts: TShift[],
  assignedUserId: string,
  isUserAllowedInSector: (userId: string, sectorId: string | null) => boolean,
) {
  return shifts.find((shift) => !isUserAllowedInSector(assignedUserId, shift.sector_id || null)) || null;
}

export function normalizeBulkEditAssignmentChoice(value: string | null | undefined) {
  return value || '__keep__';
}

export function getBulkEditAssignmentMode(choice: string): BulkEditAssignmentMode {
  if (choice === '__keep__') return 'keep';
  if (choice === 'disponivel') return 'available';
  if (choice === 'vago') return 'vacant';
  return 'user';
}

export function buildBulkEditShiftPayload(params: {
  data: BulkEditShiftUpdateInput;
  updatedBy: string;
  title: string;
  resolvedBaseValue: number | null;
}) {
  return {
    hospital: params.data.hospital,
    location: params.data.location || null,
    start_time: params.data.start_time,
    end_time: params.data.end_time,
    base_value: params.resolvedBaseValue,
    notes: params.data.notes || null,
    sector_id: params.data.sector_id || null,
    title: params.title,
    updated_by: params.updatedBy,
  };
}

export function buildBulkEditRemovedMovement(params: {
  tenantId: string;
  userId: string;
  userName: string;
  assignmentId: string;
  performedBy: string;
  source: BulkEditMovementShiftContext;
  sourceSectorName: string;
  reason?: string;
}) {
  const shiftDate = new Date(`${params.source.shift_date}T00:00:00`);

  return {
    tenant_id: params.tenantId,
    month: shiftDate.getMonth() + 1,
    year: shiftDate.getFullYear(),
    user_id: params.userId,
    user_name: params.userName,
    movement_type: 'removed' as const,
    source_sector_id: params.source.sector_id || null,
    source_sector_name: params.sourceSectorName,
    source_shift_date: params.source.shift_date,
    source_shift_time: `${params.source.start_time.slice(0, 5)}-${params.source.end_time.slice(0, 5)}`,
    source_assignment_id: params.assignmentId,
    reason: params.reason,
    performed_by: params.performedBy,
  };
}

export function buildBulkEditAddedMovement(params: {
  tenantId: string;
  userId: string;
  userName: string;
  performedBy: string;
  destination: BulkEditMovementShiftContext;
  destinationSectorName: string;
  reason?: string;
}) {
  const shiftDate = new Date(`${params.destination.shift_date}T00:00:00`);

  return {
    tenant_id: params.tenantId,
    month: shiftDate.getMonth() + 1,
    year: shiftDate.getFullYear(),
    user_id: params.userId,
    user_name: params.userName,
    movement_type: 'added' as const,
    destination_sector_id: params.destination.sector_id || null,
    destination_sector_name: params.destinationSectorName,
    destination_shift_date: params.destination.shift_date,
    destination_shift_time: `${params.destination.start_time.slice(0, 5)}-${params.destination.end_time.slice(0, 5)}`,
    reason: params.reason,
    performed_by: params.performedBy,
  };
}

export function buildBulkEditStatusNotes(notes: string, assignmentChoice: 'vago' | 'disponivel') {
  const baseNotes = notes.trim();
  return assignmentChoice === 'disponivel'
    ? `[DISPONÍVEL] ${baseNotes}`.trim()
    : `[VAGO] ${baseNotes}`.trim();
}
