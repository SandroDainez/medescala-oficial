import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { parseDateOnly } from '@/lib/utils';

export interface SwapAssignment {
  id: string;
  shift_id: string;
  status?: string;
  shift: {
    id?: string;
    title: string;
    hospital: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    sector_id: string | null;
    sector?: { name: string; color: string | null } | null;
  };
}

export interface SwapTenantMember {
  user_id: string;
  name: string;
}

export interface SwapRequestItem {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
  created_at: string;
  requester_id: string;
  target_user_id: string | null;
  origin_assignment_id: string;
  requester: { name: string | null };
  target_user: { name: string | null } | null;
  origin_assignment: {
    id: string;
    user_id: string;
    shift: {
      id: string;
      title: string;
      hospital: string;
      shift_date: string;
      start_time: string;
      end_time: string;
      sector_id?: string | null;
      sector?: { name: string; color: string | null } | null;
    };
  };
}

export interface UserSwapsData {
  myAssignments: SwapAssignment[];
  tenantMembers: SwapTenantMember[];
  mySwapRequests: SwapRequestItem[];
  incomingSwapRequests: SwapRequestItem[];
  currentUserDisplayName: string;
}

const swapRequestSelect = `
  id, status, reason, created_at, requester_id, target_user_id, origin_assignment_id,
  requester:profiles!swap_requests_requester_id_profiles_fkey(name),
  target_user:profiles!swap_requests_target_user_id_profiles_fkey(name),
  origin_assignment:shift_assignments!swap_requests_origin_assignment_id_fkey(
    id, user_id,
    shift:shifts(
      id, title, hospital, shift_date, start_time, end_time, sector_id,
      sector:sectors(name, color)
    )
  )
`;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.hint, candidate.code]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' | ');
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

async function getTenantMembers(tenantId: string, userId: string): Promise<SwapTenantMember[]> {
  const { data, error } = await supabase.rpc('get_tenant_member_names', { _tenant_id: tenantId });
  if (error) throw error;

  const baseMembers = (data as SwapTenantMember[]).filter((member) => member.user_id !== userId);
  if (baseMembers.length === 0) return [];

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, name')
    .in('id', baseMembers.map((member) => member.user_id));

  if (profilesError) throw profilesError;

  const fullNameMap = new Map(
    ((profilesData as Array<{ id: string; full_name: string | null; name: string | null }> | null) ?? []).map((profile) => [
      profile.id,
      (profile.full_name?.trim() || profile.name?.trim() || '').toString(),
    ])
  );

  return baseMembers.map((member) => ({
    ...member,
    name: fullNameMap.get(member.user_id) || member.name,
  }));
}

async function notifyTenantAdmins(params: {
  tenantId: string;
  type: string;
  title: string;
  message: string;
  shiftAssignmentId?: string | null;
  excludeUserIds?: string[];
}) {
  const exclude = new Set(params.excludeUserIds ?? []);
  const { data: adminsData, error: adminsError } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('tenant_id', params.tenantId)
    .eq('role', 'admin')
    .eq('active', true);

  if (adminsError) throw adminsError;

  const adminUserIds = (adminsData ?? [])
    .map((item: { user_id: string }) => item.user_id)
    .filter(Boolean)
    .filter((id) => !exclude.has(id));

  if (adminUserIds.length === 0) return;

  const payload = adminUserIds.map((adminUserId) => ({
    tenant_id: params.tenantId,
    user_id: adminUserId,
    shift_assignment_id: params.shiftAssignmentId ?? null,
    type: params.type,
    title: params.title,
    message: params.message,
  }));

  const { error } = await supabase.from('notifications').insert(payload);
  if (error) throw error;
}

async function deleteUserNotifications(params: {
  userId: string;
  tenantId: string;
  type: string;
  shiftAssignmentId?: string | null;
}) {
  let query = supabase
    .from('notifications')
    .delete()
    .eq('user_id', params.userId)
    .eq('tenant_id', params.tenantId)
    .eq('type', params.type);

  if (params.shiftAssignmentId) {
    query = query.eq('shift_assignment_id', params.shiftAssignmentId);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function fetchUserSwapsData(userId: string, tenantId: string): Promise<UserSwapsData> {
  const today = new Date().toISOString().split('T')[0];

  const [assignmentsResult, membersResult, myRequestsResult, incomingRequestsResult, profileResult] = await Promise.all([
    supabase
      .from('shift_assignments')
      .select(`
        id, shift_id, status,
        shift:shifts(
          id, title, hospital, shift_date, start_time, end_time, sector_id,
          sector:sectors(name, color)
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .in('status', ['assigned', 'confirmed']),
    getTenantMembers(tenantId, userId),
    supabase
      .from('swap_requests')
      .select(swapRequestSelect)
      .eq('tenant_id', tenantId)
      .eq('requester_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('swap_requests')
      .select(swapRequestSelect)
      .eq('tenant_id', tenantId)
      .eq('target_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('full_name, name')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  if (assignmentsResult.error) throw assignmentsResult.error;
  if (myRequestsResult.error) throw myRequestsResult.error;
  if (incomingRequestsResult.error) throw incomingRequestsResult.error;
  if (profileResult.error) throw profileResult.error;

  const myAssignments = ((assignmentsResult.data as Array<SwapAssignment & { shift: SwapAssignment['shift'] | null }> | null) ?? [])
    .filter((assignment) => assignment.shift !== null && assignment.shift.shift_date >= today && assignment.status !== 'cancelled')
    .sort((a, b) => a.shift.shift_date.localeCompare(b.shift.shift_date)) as SwapAssignment[];

  const profile = profileResult.data as { full_name?: string | null; name?: string | null } | null;
  const currentUserDisplayName = profile?.full_name?.trim() || profile?.name?.trim() || 'Um usuário';

  return {
    myAssignments,
    tenantMembers: membersResult,
    mySwapRequests: (myRequestsResult.data ?? []) as unknown as SwapRequestItem[],
    incomingSwapRequests: (incomingRequestsResult.data ?? []) as unknown as SwapRequestItem[],
    currentUserDisplayName,
  };
}

export async function fetchEligibleSectorMembers(
  userId: string,
  tenantId: string,
  sectorId: string,
  _tenantMembers: SwapTenantMember[]
): Promise<SwapTenantMember[]> {
  const { data, error } = await supabase.rpc('get_eligible_swap_sector_members', {
    _tenant_id: tenantId,
    _sector_id: sectorId,
  });

  if (error) throw error;

  const eligibleMembers = ((data ?? []) as Array<{ user_id: string; name: string | null }>)
    .filter((member) => member.user_id && member.user_id !== userId)
    .map((member) => ({
      user_id: member.user_id,
      name: member.name?.trim() || 'Sem nome',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return eligibleMembers;
}

export async function submitSwapRequest(params: {
  tenantId: string;
  userId: string;
  currentUserDisplayName: string;
  selectedAssignment: SwapAssignment;
  selectedTargetUser: SwapTenantMember;
  reason: string;
}) {
  const { error: swapError } = await supabase
    .from('swap_requests')
    .insert({
      tenant_id: params.tenantId,
      origin_assignment_id: params.selectedAssignment.id,
      requester_id: params.userId,
      target_user_id: params.selectedTargetUser.user_id,
      reason: params.reason || null,
    });

  if (swapError) throw swapError;

  const { error: selfNotifyError } = await supabase.from('notifications').insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    shift_assignment_id: params.selectedAssignment.id,
    type: 'swap_request_sent',
    title: 'Solicitação enviada',
    message: `Seu pedido para passar o plantão "${params.selectedAssignment.shift.title}" do dia ${format(parseDateOnly(params.selectedAssignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })} foi enviado para ${params.selectedTargetUser.name}.`,
  });

  if (selfNotifyError) throw selfNotifyError;

  const { error: notifyError } = await supabase.from('notifications').insert({
    tenant_id: params.tenantId,
    user_id: params.selectedTargetUser.user_id,
    shift_assignment_id: params.selectedAssignment.id,
    type: 'swap_request',
    title: 'Solicitação de Troca de Plantão',
    message: `${params.currentUserDisplayName || 'Um colega'} quer passar o plantão "${params.selectedAssignment.shift.title}" do dia ${format(parseDateOnly(params.selectedAssignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })} para você. Acesse a área de Trocas para aceitar ou recusar.`,
  });

  if (notifyError) throw notifyError;

  await notifyTenantAdmins({
    tenantId: params.tenantId,
    type: 'swap_request_admin',
    title: 'Troca de plantão solicitada',
    message: `${params.currentUserDisplayName || 'Um usuário'} solicitou passar o plantão "${params.selectedAssignment.shift.title}" (${format(parseDateOnly(params.selectedAssignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}) para ${params.selectedTargetUser.name}.`,
    shiftAssignmentId: params.selectedAssignment.id,
    excludeUserIds: [params.userId],
  });
}

export async function decideSwapRequest(params: {
  tenantId: string;
  userId: string;
  currentUserDisplayName: string;
  swap: SwapRequestItem;
  decision: 'approved' | 'rejected';
}) {
  const { error } = await supabase.rpc('decide_swap_request', {
    _swap_request_id: params.swap.id,
    _decision: params.decision,
  });

  if (error) {
    throw new Error(getErrorMessage(error, 'Não foi possível processar a troca.'));
  }

  const decisionTitle = params.decision === 'approved' ? 'Troca aceita' : 'Troca recusada';
  const decisionText = params.decision === 'approved' ? 'aceito' : 'recusado';

  const { error: notifyError } = await supabase.from('notifications').insert({
    tenant_id: params.tenantId,
    user_id: params.swap.requester_id,
    shift_assignment_id: params.swap.origin_assignment_id,
    type: 'swap_request_update',
    title: decisionTitle,
    message: `Seu pedido para passar o plantão "${params.swap.origin_assignment?.shift?.title}" (${params.swap.origin_assignment?.shift?.shift_date ? format(parseDateOnly(params.swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR }) : ''}) foi ${decisionText}.`,
  });

  if (notifyError) throw new Error(getErrorMessage(notifyError, 'Não foi possível notificar o solicitante.'));

  await deleteUserNotifications({
    userId: params.userId,
    tenantId: params.tenantId,
    type: 'swap_request',
    shiftAssignmentId: params.swap.origin_assignment_id,
  });

  await deleteUserNotifications({
    userId: params.swap.requester_id,
    tenantId: params.tenantId,
    type: 'swap_request_sent',
    shiftAssignmentId: params.swap.origin_assignment_id,
  });

  await notifyTenantAdmins({
    tenantId: params.tenantId,
    type: 'swap_request_update_admin',
    title: decisionTitle,
    message: `Troca ${params.decision === 'approved' ? 'concluída automaticamente' : 'recusada'}. Solicitante: ${params.swap.requester?.name || 'N/A'}. ${params.decision === 'approved' ? 'Aceitou' : 'Recusou'}: ${params.currentUserDisplayName || 'N/A'}. Plantão: "${params.swap.origin_assignment?.shift?.title}" em ${params.swap.origin_assignment?.shift?.shift_date ? format(parseDateOnly(params.swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'} (${params.swap.origin_assignment?.shift?.start_time?.slice(0, 5)}-${params.swap.origin_assignment?.shift?.end_time?.slice(0, 5)}). Processado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}.`,
    shiftAssignmentId: params.swap.origin_assignment_id,
    excludeUserIds: [params.userId],
  });
}

export async function cancelSwapRequest(params: {
  swapId: string;
  tenantId: string;
  userId: string;
  originAssignmentId?: string | null;
}) {
  const { error } = await supabase
    .from('swap_requests')
    .update({ status: 'cancelled' })
    .eq('id', params.swapId);

  if (error) throw error;

  await deleteUserNotifications({
    userId: params.userId,
    tenantId: params.tenantId,
    type: 'swap_request_sent',
    shiftAssignmentId: params.originAssignmentId ?? null,
  });
}
