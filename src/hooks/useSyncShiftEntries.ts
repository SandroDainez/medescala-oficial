import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SyncResult {
  inserted: number;
  updated: number;
  errors: number;
}

export function useSyncShiftEntries() {
  const { toast } = useToast();

  /**
   * Synchronizes shift_assignments to shift_entries table.
   * This flattens the data so each (tenant, sector, date, plantonista) has one entry.
   * Uses UPSERT logic to avoid duplicates.
   */
  async function syncShiftEntries(tenantId: string, startDate?: string, endDate?: string): Promise<SyncResult> {
    const result: SyncResult = { inserted: 0, updated: 0, errors: 0 };

    try {
      // Build query for shifts with assignments
      let shiftsQuery = supabase
        .from('shifts')
        .select(`
          id,
          shift_date,
          base_value,
          sector_id,
          tenant_id
        `)
        .eq('tenant_id', tenantId)
        .not('sector_id', 'is', null);

      if (startDate) {
        shiftsQuery = shiftsQuery.gte('shift_date', startDate);
      }
      if (endDate) {
        shiftsQuery = shiftsQuery.lte('shift_date', endDate);
      }

      const { data: shifts, error: shiftsError } = await shiftsQuery;

      if (shiftsError) {
        console.error('[Sync] Error fetching shifts:', shiftsError);
        throw shiftsError;
      }

      if (!shifts || shifts.length === 0) {
        console.log('[Sync] No shifts found to sync');
        return result;
      }

      const shiftIds = shifts.map(s => s.id);

      // Get all assignments for these shifts
      const { data: assignments, error: assignmentsError } = await supabase
        .from('shift_assignments')
        .select(`
          id,
          shift_id,
          user_id,
          assigned_value,
          tenant_id
        `)
        .in('shift_id', shiftIds);

      if (assignmentsError) {
        console.error('[Sync] Error fetching assignments:', assignmentsError);
        throw assignmentsError;
      }

      if (!assignments || assignments.length === 0) {
        console.log('[Sync] No assignments found to sync');
        return result;
      }

      // Build entries to upsert
      const entries = assignments.map(assignment => {
        const shift = shifts.find(s => s.id === assignment.shift_id);
        if (!shift || !shift.sector_id) return null;

        const assignedVal = Number(assignment.assigned_value) || 0;
        const baseVal = Number(shift.base_value) || 0;
        const finalValue = assignedVal > 0 ? assignedVal : (baseVal > 0 ? baseVal : null);

        return {
          tenant_id: tenantId,
          setor_id: shift.sector_id,
          escala_id: null,
          data: shift.shift_date,
          plantonista_id: assignment.user_id,
          valor: finalValue,
          status_valor: finalValue !== null ? 'COM_VALOR' : 'SEM_VALOR',
          source_shift_id: shift.id,
          source_assignment_id: assignment.id,
        };
      }).filter(Boolean);

      if (entries.length === 0) {
        console.log('[Sync] No valid entries to sync');
        return result;
      }

      // Upsert entries (on conflict update)
      const { data: upsertedData, error: upsertError } = await supabase
        .from('shift_entries')
        .upsert(entries as any, {
          onConflict: 'tenant_id,setor_id,data,plantonista_id',
          ignoreDuplicates: false,
        })
        .select();

      if (upsertError) {
        console.error('[Sync] Upsert error:', upsertError);
        result.errors = entries.length;
        throw upsertError;
      }

      result.inserted = upsertedData?.length || entries.length;
      console.log(`[Sync] Successfully synced ${result.inserted} entries`);

      return result;
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      throw error;
    }
  }

  async function syncAndNotify(tenantId: string, startDate?: string, endDate?: string) {
    try {
      const result = await syncShiftEntries(tenantId, startDate, endDate);
      toast({
        title: 'Sincronização concluída',
        description: `${result.inserted} registros sincronizados`,
      });
      return result;
    } catch (error: any) {
      toast({
        title: 'Erro na sincronização',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive',
      });
      throw error;
    }
  }

  return { syncShiftEntries, syncAndNotify };
}
