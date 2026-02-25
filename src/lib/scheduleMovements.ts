import { supabase } from '@/integrations/supabase/client';

// Helper function to record a movement (to be called from ShiftCalendar)
// IMPORTANT: When replacing user A with user B on a shift:
// - User B is being ADDED to this sector (transferred TO here from somewhere else or added fresh)
// - User A is being REMOVED from this sector (with no destination, or transferred somewhere else)
export async function recordScheduleMovement(params: {
  tenant_id: string;
  month: number;
  year: number;
  user_id: string;
  user_name: string;
  movement_type: 'transferred' | 'removed' | 'added';
  source_sector_id?: string | null;
  source_sector_name?: string | null;
  source_shift_date?: string | null;
  source_shift_time?: string | null;
  source_assignment_id?: string | null;
  destination_sector_id?: string | null;
  destination_sector_name?: string | null;
  destination_shift_date?: string | null;
  destination_shift_time?: string | null;
  destination_assignment_id?: string | null;
  reason?: string | null;
  performed_by: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const isSectorFinalized = async (sectorId?: string | null): Promise<boolean> => {
      let query = supabase
        .from('schedule_finalizations')
        .select('id')
        .eq('tenant_id', params.tenant_id)
        .eq('month', params.month)
        .eq('year', params.year);

      if (sectorId) {
        query = query.eq('sector_id', sectorId);
      } else {
        query = query.is('sector_id', null);
      }

      const { data } = await query.maybeSingle();
      return !!data;
    };

    // Only record movement when there is finalization in the relevant scope:
    // - removed: source sector finalized
    // - added: destination sector finalized
    // - transferred: source OR destination sector finalized
    let shouldRecord = false;
    if (params.movement_type === 'removed') {
      shouldRecord = await isSectorFinalized(params.source_sector_id);
    } else if (params.movement_type === 'added') {
      shouldRecord = await isSectorFinalized(params.destination_sector_id);
    } else {
      const [sourceFinalized, destinationFinalized] = await Promise.all([
        isSectorFinalized(params.source_sector_id),
        isSectorFinalized(params.destination_sector_id),
      ]);
      shouldRecord = sourceFinalized || destinationFinalized;
    }

    if (!shouldRecord) {
      return { success: true }; // Not an error, just don't record
    }

    // Auto-detect transfers: if this is a "removed" action, check if there's a recent "added"
    // for the same user on the same day (within last 5 minutes) and update it to "transferred"
    if (params.movement_type === 'removed' && params.source_shift_date) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data: recentAdd } = await supabase
        .from('schedule_movements')
        .select('*')
        .eq('tenant_id', params.tenant_id)
        .eq('user_id', params.user_id)
        .eq('movement_type', 'added')
        .eq('destination_shift_date', params.source_shift_date) // Same day
        .gte('performed_at', fiveMinutesAgo)
        .order('performed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentAdd) {
        // Update the "added" record to be a "transferred" with source info
        const { error: updateError } = await supabase
          .from('schedule_movements')
          .update({
            movement_type: 'transferred',
            source_sector_id: params.source_sector_id,
            source_sector_name: params.source_sector_name,
            source_shift_date: params.source_shift_date,
            source_shift_time: params.source_shift_time,
            source_assignment_id: params.source_assignment_id,
            reason: `Transferido de ${params.source_sector_name} para ${recentAdd.destination_sector_name}`,
          })
          .eq('id', recentAdd.id);

        if (updateError) throw updateError;
        return { success: true };
      }
    }

    // Auto-detect transfers: if this is an "added" action, check if there's a recent "removed"
    // for the same user on the same day (within last 5 minutes) and update it to "transferred"
    if (params.movement_type === 'added' && params.destination_shift_date) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data: recentRemove } = await supabase
        .from('schedule_movements')
        .select('*')
        .eq('tenant_id', params.tenant_id)
        .eq('user_id', params.user_id)
        .eq('movement_type', 'removed')
        .eq('source_shift_date', params.destination_shift_date) // Same day
        .gte('performed_at', fiveMinutesAgo)
        .order('performed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentRemove) {
        // Update the "removed" record to be a "transferred" with destination info
        const { error: updateError } = await supabase
          .from('schedule_movements')
          .update({
            movement_type: 'transferred',
            destination_sector_id: params.destination_sector_id,
            destination_sector_name: params.destination_sector_name,
            destination_shift_date: params.destination_shift_date,
            destination_shift_time: params.destination_shift_time,
            destination_assignment_id: params.destination_assignment_id,
            reason: `Transferido de ${recentRemove.source_sector_name} para ${params.destination_sector_name}`,
          })
          .eq('id', recentRemove.id);

        if (updateError) throw updateError;
        return { success: true };
      }
    }

    // No matching pair found, insert as new movement
    const { error } = await supabase
      .from('schedule_movements')
      .insert({
        tenant_id: params.tenant_id,
        month: params.month,
        year: params.year,
        user_id: params.user_id,
        user_name: params.user_name,
        movement_type: params.movement_type,
        source_sector_id: params.source_sector_id || null,
        source_sector_name: params.source_sector_name || null,
        source_shift_date: params.source_shift_date || null,
        source_shift_time: params.source_shift_time || null,
        source_assignment_id: params.source_assignment_id || null,
        destination_sector_id: params.destination_sector_id || null,
        destination_sector_name: params.destination_sector_name || null,
        destination_shift_date: params.destination_shift_date || null,
        destination_shift_time: params.destination_shift_time || null,
        destination_assignment_id: params.destination_assignment_id || null,
        reason: params.reason || null,
        performed_by: params.performed_by,
      });

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error recording schedule movement:', error);
    return { success: false, error: error?.message };
  }
}

// Helper to check if schedule is finalized for a specific sector
export async function isScheduleFinalized(
  tenant_id: string,
  month: number,
  year: number,
  sector_id?: string | null,
): Promise<boolean> {
  let query = supabase
    .from('schedule_finalizations')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('month', month)
    .eq('year', year);

  if (sector_id) {
    query = query.eq('sector_id', sector_id);
  } else {
    query = query.is('sector_id', null);
  }

  const { data } = await query.maybeSingle();

  return !!data;
}
