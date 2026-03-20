import { supabase } from '@/integrations/supabase/client';

const ASSIGNMENT_SELECT =
  'id, shift_id, user_id, assigned_value, status, profile:profiles!shift_assignments_user_id_profiles_fkey(name, full_name)';

export async function upsertAdminAssignment(params: {
  tenantId: string;
  shiftId: string;
  userId: string;
  assignedValue: number | null;
  updatedBy?: string;
}) {
  const { data, error } = await supabase.rpc('create_assignment_with_snapshot', {
    _tenant_id: params.tenantId,
    _shift_id: params.shiftId,
    _user_id: params.userId,
    _manual_value: params.assignedValue,
    _status: 'assigned',
    _performed_by: params.updatedBy ?? null,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.assignment_id) return null;

  return {
    id: row.assignment_id,
  };
}

export async function updateAdminAssignmentValue(params: {
  assignmentId: string;
  assignedValue: number | null;
  updatedBy?: string;
}) {
  const { data, error } = await supabase.rpc('override_assignment_value', {
    _assignment_id: params.assignmentId,
    _new_value: params.assignedValue,
    _performed_by: params.updatedBy ?? null,
    _reason: 'admin_assignment_update',
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.assignment_id) return null;

  return {
    id: row.assignment_id,
  };
}

export async function deleteAdminAssignment(assignmentId: string) {
  const { data, error } = await supabase
    .from('shift_assignments')
    .delete()
    .eq('id', assignmentId)
    .select('id');

  if (error) throw error;
  return data ?? [];
}

export async function deleteAdminAssignmentsByShiftIds(shiftIds: string[]) {
  const { error } = await supabase
    .from('shift_assignments')
    .delete()
    .in('shift_id', shiftIds);

  if (error) throw error;
}

export async function fetchAdminAssignmentsByShiftIds(shiftIds: string[]) {
  const { data, error } = await supabase
    .from('shift_assignments')
    .select(ASSIGNMENT_SELECT)
    .in('shift_id', shiftIds);

  if (error) throw error;
  return data ?? [];
}

export async function fetchAdminAssignmentRange(params: {
  tenantId: string;
  start: string;
  end: string;
}) {
  const { data, error } = await supabase.rpc('get_shift_assignments_range', {
    _tenant_id: params.tenantId,
    _start: params.start,
    _end: params.end,
  });

  if (error) throw error;
  return data ?? [];
}

export async function cloneAdminAssignmentToShift(params: {
  tenantId: string;
  targetShiftId: string;
  sourceAssignment: {
    user_id: string;
    assigned_value: number | null;
    status?: string | null;
  };
  updatedBy?: string;
}) {
  return upsertAdminAssignment({
    tenantId: params.tenantId,
    shiftId: params.targetShiftId,
    userId: params.sourceAssignment.user_id,
    assignedValue: params.sourceAssignment.assigned_value,
    updatedBy: params.updatedBy,
  });
}

export async function transferAdminAssignment(params: {
  tenantId: string;
  sourceAssignmentId: string;
  targetShiftId: string;
  userId: string;
  assignedValue: number | null;
  updatedBy: string;
}) {
  const { data, error } = await supabase.rpc('transfer_assignment_preserving_value', {
    _source_assignment_id: params.sourceAssignmentId,
    _target_shift_id: params.targetShiftId,
    _target_user_id: params.userId,
    _performed_by: params.updatedBy,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.inserted_id) throw new Error('Falha ao transferir atribuição');

  return {
    insertedId: row.inserted_id,
  };
}
