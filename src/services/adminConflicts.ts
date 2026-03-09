import { supabase } from '@/integrations/supabase/client';

export async function resolveAdminProfileId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id;
}

export async function createAdminConflictResolution(payload: Record<string, unknown>) {
  const { error } = await supabase
    .from('conflict_resolutions')
    .insert(payload);

  if (error) throw error;
}

export async function fetchAdminConflictHistory(tenantId: string) {
  const { data, error } = await supabase
    .from('conflict_resolutions')
    .select('*, resolved_by_profile:profiles!conflict_resolutions_resolved_by_fkey(full_name, name)')
    .eq('tenant_id', tenantId)
    .order('resolved_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}

export async function deleteAdminConflictHistoryByIds(params: {
  tenantId: string;
  ids: string[];
}) {
  const { error } = await supabase
    .from('conflict_resolutions')
    .delete()
    .eq('tenant_id', params.tenantId)
    .in('id', params.ids);

  if (error) throw error;
}

export async function deleteAllAdminConflictHistory(tenantId: string) {
  const { error } = await supabase
    .from('conflict_resolutions')
    .delete()
    .eq('tenant_id', tenantId);

  if (error) throw error;
}
