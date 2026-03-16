import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface AdminShiftOffer {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  reviewed_at: string | null;
  user_id: string;
  shift_id: string;
  user: { name: string } | null;
  shift: {
    id: string;
    title: string;
    hospital: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    base_value: number | null;
    sector: { name: string; color: string } | null;
  } | null;
}

export async function fetchAdminOffers(tenantId: string) {
  const { data, error } = await supabase
    .from('shift_offers')
    .select(`
      id, status, message, created_at, reviewed_at, user_id, shift_id,
      user:profiles!shift_offers_user_id_fkey(name),
      shift:shifts(id, title, hospital, shift_date, start_time, end_time, base_value, sector:sectors(name, color))
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as AdminShiftOffer[];
}

export async function approveAdminOffer(params: {
  tenantId: string;
  reviewerId: string;
  offer: AdminShiftOffer;
}) {
  const { offer, tenantId, reviewerId } = params;

  const { data: existingAssignments, error: existingAssignmentsError } = await supabase
    .from('shift_assignments')
    .select('id, user_id, status')
    .eq('shift_id', offer.shift_id)
    .in('status', ['assigned', 'confirmed', 'completed']);

  if (existingAssignmentsError) throw existingAssignmentsError;

  const activeAssignments = (existingAssignments ?? []) as Array<{ id: string; user_id: string; status: string }>;
  const assignedToAnotherUser = activeAssignments.some((assignment) => assignment.user_id !== offer.user_id);
  const alreadyAssignedToSameUser = activeAssignments.some((assignment) => assignment.user_id === offer.user_id);

  if (assignedToAnotherUser) {
    throw new Error('Este plantão já foi preenchido por outro plantonista.');
  }

  const { error: offerError } = await supabase
    .from('shift_offers')
    .update({
      status: 'accepted',
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq('id', offer.id);

  if (offerError) throw offerError;

  if (!alreadyAssignedToSameUser) {
    const { error: assignError } = await supabase
      .from('shift_assignments')
      .insert({
        tenant_id: tenantId,
        shift_id: offer.shift_id,
        user_id: offer.user_id,
        assigned_value: offer.shift?.base_value || null,
        status: 'assigned',
        updated_by: reviewerId,
      });

    if (assignError) throw assignError;
  }

  const { error: rejectOthersError } = await supabase
    .from('shift_offers')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq('shift_id', offer.shift_id)
    .eq('status', 'pending')
    .neq('id', offer.id);

  if (rejectOthersError) throw rejectOthersError;

  const { error: notifyError } = await supabase
    .from('notifications')
    .insert({
      tenant_id: tenantId,
      user_id: offer.user_id,
      type: 'shift',
      title: 'Oferta Aceita!',
      message: `Sua solicitação para a oferta "${offer.shift?.title}" em ${format(parseISO(offer.shift?.shift_date || ''), 'dd/MM')} foi aceita!`,
      shift_assignment_id: null,
    });

  if (notifyError) throw notifyError;
}

export async function rejectAdminOffer(params: {
  tenantId: string;
  reviewerId: string;
  offer: AdminShiftOffer;
}) {
  const { offer, tenantId, reviewerId } = params;

  const { error: updateError } = await supabase
    .from('shift_offers')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq('id', offer.id);

  if (updateError) throw updateError;

  const { error: notifyError } = await supabase
    .from('notifications')
    .insert({
      tenant_id: tenantId,
      user_id: offer.user_id,
      type: 'shift',
      title: 'Oferta Recusada',
      message: `Sua solicitação para a oferta "${offer.shift?.title}" em ${format(parseISO(offer.shift?.shift_date || ''), 'dd/MM')} foi recusada.`,
    });

  if (notifyError) throw notifyError;
}

export async function deleteAdminOffers(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('shift_offers')
    .delete()
    .in('id', ids);

  if (error) throw error;
}

export async function acceptAdminShiftOffer(params: {
  offerId: string;
  shiftId: string;
  reviewerId: string;
}) {
  const reviewedAt = new Date().toISOString();

  const { error: acceptError } = await supabase
    .from('shift_offers')
    .update({
      status: 'accepted',
      reviewed_by: params.reviewerId,
      reviewed_at: reviewedAt,
    })
    .eq('id', params.offerId);

  if (acceptError) throw acceptError;

  const { error: rejectError } = await supabase
    .from('shift_offers')
    .update({
      status: 'rejected',
      reviewed_by: params.reviewerId,
      reviewed_at: reviewedAt,
    })
    .eq('shift_id', params.shiftId)
    .eq('status', 'pending')
    .neq('id', params.offerId);

  if (rejectError) throw rejectError;
}

export async function rejectAdminShiftOffer(params: {
  offerId: string;
  reviewerId: string;
}) {
  const { error } = await supabase
    .from('shift_offers')
    .update({
      status: 'rejected',
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.offerId);

  if (error) throw error;
}
