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
  const { data, error } = await supabase
    .from('shift_assignments')
    .upsert(
      {
        tenant_id: params.tenantId,
        shift_id: params.shiftId,
        user_id: params.userId,
        assigned_value: params.assignedValue,
        updated_by: params.updatedBy,
      },
      { onConflict: 'shift_id,user_id' }
    )
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateAdminAssignmentValue(params: {
  assignmentId: string;
  assignedValue: number | null;
  updatedBy?: string;
}) {
  const { data, error } = await supabase
    .from('shift_assignments')
    .update({
      assigned_value: params.assignedValue,
      updated_by: params.updatedBy,
    })
    .eq('id', params.assignmentId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return data;
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
  const inserted = await upsertAdminAssignment({
    tenantId: params.tenantId,
    shiftId: params.targetShiftId,
    userId: params.userId,
    assignedValue: params.assignedValue,
    updatedBy: params.updatedBy,
  });

  if (!inserted?.id) {
    throw new Error('Falha ao criar atribuição no destino');
  }

  const deletedRows = await deleteAdminAssignment(params.sourceAssignmentId);
  if (deletedRows.length === 0) {
    throw new Error('Não foi possível remover a atribuição de origem.');
  }

  return {
    insertedId: inserted.id,
  };
}
