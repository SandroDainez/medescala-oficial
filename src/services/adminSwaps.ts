import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

export interface AdminSwapRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
  admin_notes: string | null;
  created_at: string;
  requester_id?: string;
  target_user_id?: string | null;
  reviewed_at?: string | null;
  requester: { name: string | null };
  target_user: { name: string | null } | null;
  origin_assignment: {
    shift: {
      title: string;
      hospital: string;
      shift_date: string;
      start_time: string;
      end_time: string;
      sector: { name: string; color: string | null } | null;
    };
  };
}

export interface AdminSwapOffer {
  id: string;
  shift_id: string;
  user_id: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  profile: { name: string | null };
  shift: {
    title: string;
    hospital: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    sector: { name: string; color: string | null } | null;
  };
}

export interface AdminSwapsData {
  swaps: AdminSwapRequest[];
  offers: AdminSwapOffer[];
}

export async function fetchAdminSwapsData(tenantId: string): Promise<AdminSwapsData> {
  const [swapsResult, offersResult] = await Promise.all([
    supabase
      .from('swap_requests')
      .select(`
        id, status, reason, admin_notes, created_at, requester_id, target_user_id, reviewed_at,
        requester:profiles!swap_requests_requester_id_profiles_fkey(name), 
        target_user:profiles!swap_requests_target_user_id_profiles_fkey(name), 
        origin_assignment:shift_assignments!swap_requests_origin_assignment_id_fkey(
          shift:shifts(title, hospital, shift_date, start_time, end_time, sector:sectors(name, color))
        )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    supabase
      .from('shift_offers')
      .select(`
        id, shift_id, user_id, message, status, created_at,
        profile:profiles!shift_offers_user_id_fkey(name),
        shift:shifts!shift_offers_shift_id_fkey(
          title, hospital, shift_date, start_time, end_time,
          sector:sectors(name, color)
        )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
  ]);

  if (swapsResult.error) throw swapsResult.error;
  if (offersResult.error) throw offersResult.error;

  return {
    swaps: (swapsResult.data ?? []) as unknown as AdminSwapRequest[],
    offers: (offersResult.data ?? []) as unknown as AdminSwapOffer[],
  };
}

export async function decideAdminSwap(params: {
  tenantId: string;
  swap: AdminSwapRequest;
  action: 'approved' | 'rejected';
  adminNotes: string;
}) {
  const decision = params.action === 'approved' ? 'approved' : 'rejected';

  const { error: decideError } = await supabase.rpc('decide_swap_request', {
    _swap_request_id: params.swap.id,
    _decision: decision,
  });
  if (decideError) throw decideError;

  const { error: notesError } = await supabase
    .from('swap_requests')
    .update({ admin_notes: params.adminNotes || null })
    .eq('id', params.swap.id);
  if (notesError) throw notesError;

  const shiftTitle = params.swap.origin_assignment?.shift?.title || 'plantão';
  const shiftDate = params.swap.origin_assignment?.shift?.shift_date
    ? format(new Date(params.swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })
    : '';

  const recipients = [params.swap.requester_id, params.swap.target_user_id].filter((id): id is string => Boolean(id));
  if (recipients.length > 0) {
    const { error: notifyError } = await supabase.from('notifications').insert(
      recipients.map((recipientId) => ({
        tenant_id: params.tenantId,
        user_id: recipientId,
        type: 'swap_request_update',
        title: params.action === 'approved' ? 'Troca aprovada pela administração' : 'Troca recusada pela administração',
        message:
          params.action === 'approved'
            ? `A troca do ${shiftTitle}${shiftDate ? ` (${shiftDate})` : ''} foi aprovada pela administração.`
            : `A troca do ${shiftTitle}${shiftDate ? ` (${shiftDate})` : ''} foi recusada pela administração.`,
      }))
    );
    if (notifyError) throw notifyError;
  }
}

export async function decideAdminOffer(params: {
  tenantId: string;
  reviewerId?: string;
  offer: AdminSwapOffer;
  action: 'accepted' | 'rejected';
}) {
  if (params.action === 'accepted') {
    const { data: existingAssignments, error: existingAssignmentsError } = await supabase
      .from('shift_assignments')
      .select('id, user_id, status')
      .eq('shift_id', params.offer.shift_id)
      .in('status', ['assigned', 'confirmed', 'completed']);

    if (existingAssignmentsError) throw existingAssignmentsError;

    const activeAssignments = (existingAssignments ?? []) as Array<{ id: string; user_id: string; status: string }>;
    const assignedToAnotherUser = activeAssignments.some((assignment) => assignment.user_id !== params.offer.user_id);
    const alreadyAssignedToSameUser = activeAssignments.some((assignment) => assignment.user_id === params.offer.user_id);

    if (assignedToAnotherUser) {
      throw new Error('Este plantão já foi preenchido por outro plantonista.');
    }

    const { error: updateError } = await supabase
      .from('shift_offers')
      .update({
        status: params.action,
        reviewed_by: params.reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', params.offer.id);
    if (updateError) throw updateError;

    const { data: shiftData, error: shiftError } = await supabase
      .from('shifts')
      .select('base_value')
      .eq('id', params.offer.shift_id)
      .single();
    if (shiftError) throw shiftError;

    if (!alreadyAssignedToSameUser) {
      const { error: assignError } = await supabase
        .from('shift_assignments')
        .insert({
          tenant_id: params.tenantId,
          shift_id: params.offer.shift_id,
          user_id: params.offer.user_id,
          assigned_value: shiftData?.base_value || null,
          status: 'assigned',
          updated_by: params.reviewerId,
        });
      if (assignError) throw assignError;
    }

    const { error: shiftUpdateError } = await supabase
      .from('shifts')
      .update({
        notes: null,
        updated_by: params.reviewerId,
      })
      .eq('id', params.offer.shift_id);
    if (shiftUpdateError) throw shiftUpdateError;

    const { error: rejectOthersError } = await supabase
      .from('shift_offers')
      .update({
        status: 'rejected',
        reviewed_by: params.reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('shift_id', params.offer.shift_id)
      .eq('status', 'pending')
      .neq('id', params.offer.id);
    if (rejectOthersError) throw rejectOthersError;

    return;
  }

  const { error: updateError } = await supabase
    .from('shift_offers')
    .update({
      status: params.action,
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.offer.id);
  if (updateError) throw updateError;

}

export async function deleteAdminSwaps(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('swap_requests')
    .delete()
    .in('id', ids);
  if (error) throw error;
}

export async function deleteAdminSwapOffers(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('shift_offers')
    .delete()
    .in('id', ids);
  if (error) throw error;
}
