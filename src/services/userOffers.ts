import { format, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

export interface AvailableShift {
  id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  base_value: number | null;
  notes?: string | null;
  open_kind?: 'available' | 'vacant';
  sector_id?: string | null;
  sector: { id: string; name: string; color: string } | null;
}

export interface MyOffer {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  reviewed_at: string | null;
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

export interface UserOffersData {
  availableShifts: AvailableShift[];
  myOffers: MyOffer[];
  myAssignedShiftIds: Set<string>;
  memberSectorIds: Set<string>;
}

export interface ClaimShiftParams {
  userId: string;
  tenantId: string;
  shift: AvailableShift;
  offerMessage: string;
  memberSectorIds: Set<string>;
}

function getShiftOpenKind(params: {
  shiftId: string;
  notes?: string | null;
  takenShiftIds: Set<string>;
}): 'available' | 'vacant' | null {
  const notes = params.notes ?? '';
  const hasActiveAssignment = params.takenShiftIds.has(params.shiftId);

  if (notes.includes('[DISPONÍVEL]')) return 'available';
  if (notes.includes('[VAGO]')) return 'vacant';
  if (!hasActiveAssignment) return 'vacant';

  return null;
}

export async function fetchUserOffersData(userId: string, tenantId: string): Promise<UserOffersData> {
  const today = startOfDay(new Date()).toISOString().split('T')[0];
  const end = format(new Date(new Date().setMonth(new Date().getMonth() + 12)), 'yyyy-MM-dd');

  const [shiftsResult, membershipResult, rosterResult, myAssignmentsResult, offersResult] = await Promise.all([
    supabase
      .from('shifts')
      .select(`
        id, title, hospital, location, shift_date, start_time, end_time, base_value, sector_id, notes,
        sector:sectors(id, name, color)
      `)
      .eq('tenant_id', tenantId)
      .gte('shift_date', today)
      .order('shift_date', { ascending: true }),
    supabase
      .from('sector_memberships')
      .select('sector_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId),
    supabase.rpc('get_shift_roster', {
      _tenant_id: tenantId,
      _start: today,
      _end: end,
    }),
    supabase
      .from('shift_assignments')
      .select('shift_id')
      .eq('user_id', userId)
      .in('status', ['assigned', 'confirmed', 'completed']),
    supabase
      .from('shift_offers')
      .select(`
        id, status, message, created_at, reviewed_at,
        shift:shifts(id, title, hospital, shift_date, start_time, end_time, base_value, sector:sectors(name, color))
      `)
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  if (shiftsResult.error) throw shiftsResult.error;
  if (membershipResult.error) throw membershipResult.error;
  if (rosterResult.error) throw rosterResult.error;
  if (myAssignmentsResult.error) throw myAssignmentsResult.error;
  if (offersResult.error) throw offersResult.error;

  const memberSectorIds = new Set((membershipResult.data ?? []).map((m: { sector_id: string }) => m.sector_id));
  const takenShiftIds = new Set(
    (rosterResult.data ?? [])
      .filter((row: { shift_id: string; status?: string | null }) => row.status !== 'cancelled')
      .map((row: { shift_id: string }) => row.shift_id)
  );
  const myAssignedShiftIds = new Set((myAssignmentsResult.data ?? []).map((row: { shift_id: string }) => row.shift_id));

  const availableShifts = ((shiftsResult.data ?? []) as unknown as AvailableShift[])
    .map((shift) => {
      const openKind = getShiftOpenKind({
        shiftId: shift.id,
        notes: shift.notes,
        takenShiftIds,
      });

      return openKind ? { ...shift, open_kind: openKind } : null;
    })
    .filter((shift): shift is AvailableShift => shift !== null)
    .filter((shift) => !!shift.sector_id && memberSectorIds.has(shift.sector_id));

  return {
    availableShifts,
    myOffers: (offersResult.data ?? []) as unknown as MyOffer[],
    myAssignedShiftIds,
    memberSectorIds,
  };
}

export async function claimShiftForUser({
  userId,
  tenantId,
  shift,
  offerMessage,
  memberSectorIds,
}: ClaimShiftParams) {
  const shiftSectorId = shift.sector?.id ?? shift.sector_id ?? null;
  if (!shiftSectorId || !memberSectorIds.has(shiftSectorId)) {
    throw new Error('Você só pode aceitar plantões do setor em que está cadastrado.');
  }

  const [{ data: profileData, error: profileError }, claimResult] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', userId).single(),
    (supabase as never as { rpc: typeof supabase.rpc }).rpc('claim_open_shift', {
      _shift_id: shift.id,
      _message: offerMessage.trim() || null,
    }),
  ]);

  if (profileError) throw profileError;
  if (claimResult.error) throw claimResult.error;

  const { data: admins, error: adminsError } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('active', true);

  if (adminsError) throw adminsError;

  if (admins && admins.length > 0) {
    const userName = profileData?.name || 'Um plantonista';
    const shiftDate = format(parseISO(shift.shift_date), 'dd/MM/yyyy', { locale: ptBR });
    const shiftTime = `${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}`;
    const messageText = offerMessage.trim()
      ? `${userName} aceitou o plantão "${shift.title}" em ${shiftDate} (${shiftTime}).\n\nMensagem: "${offerMessage.trim()}"`
      : `${userName} aceitou o plantão "${shift.title}" em ${shiftDate} (${shiftTime}).`;

    const notifications = admins.map((admin) => ({
      tenant_id: tenantId,
      user_id: admin.user_id,
      type: 'offer',
      title: 'Plantão aceito por plantonista',
      message: messageText,
    }));

    const { error: notificationError } = await supabase.from('notifications').insert(notifications);
    if (notificationError) throw notificationError;
  }
}

export async function cancelUserOffer(offerId: string) {
  const { error } = await supabase
    .from('shift_offers')
    .delete()
    .eq('id', offerId);

  if (error) throw error;
}
