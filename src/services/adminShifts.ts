import { supabase } from '@/integrations/supabase/client';

export interface PersistedShiftPayload {
  tenant_id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  base_value: number | null;
  notes: string | null;
  sector_id: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

export async function confirmAdminShiftExists(shiftId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('shifts')
    .select('id')
    .eq('id', shiftId)
    .maybeSingle();

  if (error) return false;
  return !!data?.id;
}

export async function insertAdminShiftAndGetId(payload: PersistedShiftPayload): Promise<string> {
  const { data, error } = await supabase
    .from('shifts')
    .insert(payload)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (data?.id) return data.id;

  const { data: found, error: findError } = await supabase
    .from('shifts')
    .select('id')
    .eq('tenant_id', payload.tenant_id)
    .eq('shift_date', payload.shift_date)
    .eq('start_time', payload.start_time)
    .eq('end_time', payload.end_time)
    .eq('hospital', payload.hospital)
    .eq('sector_id', payload.sector_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError || !found?.id) {
    throw new Error('Plantão criado, mas não foi possível confirmar o ID.');
  }

  return found.id;
}

export async function findAdminShiftIdByNaturalKey(params: {
  tenantId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  hospital: string;
  sectorId: string | null;
}) {
  const { data, error } = await supabase
    .from('shifts')
    .select('id')
    .eq('tenant_id', params.tenantId)
    .eq('shift_date', params.shiftDate)
    .eq('start_time', params.startTime)
    .eq('end_time', params.endTime)
    .eq('hospital', params.hospital)
    .eq('sector_id', params.sectorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export async function fetchAdminShiftIdsByNaturalKey(params: {
  tenantId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  hospital: string;
  sectorId: string | null;
}) {
  const { data, error } = await supabase
    .from('shifts')
    .select('id')
    .eq('tenant_id', params.tenantId)
    .eq('shift_date', params.shiftDate)
    .eq('start_time', params.startTime)
    .eq('end_time', params.endTime)
    .eq('hospital', params.hospital)
    .eq('sector_id', params.sectorId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

export async function updateAdminShiftById(
  shiftId: string,
  payload: Partial<PersistedShiftPayload>,
) {
  const { error } = await supabase
    .from('shifts')
    .update(payload)
    .eq('id', shiftId);

  if (error) throw error;
}

export async function updateAdminShiftsByIds(
  shiftIds: string[],
  payload: Partial<PersistedShiftPayload>,
) {
  const { error } = await supabase
    .from('shifts')
    .update(payload)
    .in('id', shiftIds);

  if (error) throw error;
}

export async function deleteAdminShiftById(shiftId: string) {
  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', shiftId);

  if (error) throw error;
}

export async function deleteAdminShiftsByIds(shiftIds: string[]) {
  const { error } = await supabase
    .from('shifts')
    .delete()
    .in('id', shiftIds);

  if (error) throw error;
}

export async function fetchAdminShiftsInRange(params: {
  tenantId: string;
  start: string;
  end: string;
}) {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('tenant_id', params.tenantId)
    .gte('shift_date', params.start)
    .lte('shift_date', params.end)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
