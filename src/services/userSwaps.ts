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
  tenantMembers: SwapTenantMember[]
): Promise<SwapTenantMember[]> {
  const { data: membershipsData, error: membershipsError } = await supabase
    .from('sector_memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('sector_id', sectorId);

  if (membershipsError) throw membershipsError;

  const sectorUserIds = Array.from(
    new Set((membershipsData ?? []).map((membership: { user_id: string }) => membership.user_id).filter(Boolean))
  );

  if (sectorUserIds.length === 0) {
    return [...tenantMembers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  const [eligibleMembershipsResult, eligibleProfilesResult] = await Promise.all([
    supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .eq('role', 'user')
      .in('user_id', sectorUserIds),
    supabase
      .from('profiles')
      .select('id, full_name, name, profile_type')
      .in('id', sectorUserIds),
  ]);

  if (eligibleMembershipsResult.error) throw eligibleMembershipsResult.error;
  if (eligibleProfilesResult.error) throw eligibleProfilesResult.error;

  const eligibleUserIdsFromMembership = new Set(
    ((eligibleMembershipsResult.data ?? []) as Array<{ user_id: string }>).map((membership) => membership.user_id)
  );

  const eligibleNameMap = new Map(
    ((eligibleProfilesResult.data ?? []) as Array<{ id: string; full_name: string | null; name: string | null; profile_type: string | null }>)
      .filter((profile) => profile.profile_type === 'plantonista')
      .map((profile) => [profile.id, (profile.full_name?.trim() || profile.name?.trim() || 'Sem nome') as string])
  );

  const filteredMembers = tenantMembers
    .filter((member) => member.user_id !== userId)
    .filter((member) => eligibleUserIdsFromMembership.has(member.user_id) && eligibleNameMap.has(member.user_id))
    .map((member) => ({
      ...member,
      name: eligibleNameMap.get(member.user_id) || member.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return filteredMembers;
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

  if (error) throw error;

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

  if (notifyError) throw notifyError;

  await notifyTenantAdmins({
    tenantId: params.tenantId,
    type: 'swap_request_update_admin',
    title: decisionTitle,
    message: `Troca ${params.decision === 'approved' ? 'concluída automaticamente' : 'recusada'}. Solicitante: ${params.swap.requester?.name || 'N/A'}. ${params.decision === 'approved' ? 'Aceitou' : 'Recusou'}: ${params.currentUserDisplayName || 'N/A'}. Plantão: "${params.swap.origin_assignment?.shift?.title}" em ${params.swap.origin_assignment?.shift?.shift_date ? format(parseDateOnly(params.swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'} (${params.swap.origin_assignment?.shift?.start_time?.slice(0, 5)}-${params.swap.origin_assignment?.shift?.end_time?.slice(0, 5)}). Processado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}.`,
    shiftAssignmentId: params.swap.origin_assignment_id,
    excludeUserIds: [params.userId],
  });
}

export async function cancelSwapRequest(swapId: string) {
  const { error } = await supabase
    .from('swap_requests')
    .update({ status: 'cancelled' })
    .eq('id', swapId);

  if (error) throw error;
}
