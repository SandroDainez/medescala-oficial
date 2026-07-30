import { supabase } from '@/integrations/supabase/client';

export type DeletionScope = 'periodo' | 'dias' | 'selecao';

/**
 * Registra uma exclusão em massa de plantões para auditoria.
 *
 * Por que existe: recordScheduleMovement só grava quando a escala do mês está
 * finalizada, então apagar uma escala em bloco não deixava nenhum rastro. Este log
 * grava sempre. Nunca lança erro — auditoria não deve impedir a operação.
 */
export async function logScheduleDeletion(params: {
  tenantId: string;
  performedBy?: string | null;
  scope: DeletionScope;
  sectorId?: string | null;
  sectorName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  shiftsDeleted: number;
  assignmentsDeleted: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabase.from('schedule_deletion_logs').insert({
      tenant_id: params.tenantId,
      performed_by: params.performedBy ?? null,
      scope: params.scope,
      sector_id: params.sectorId ?? null,
      sector_name: params.sectorName ?? null,
      date_from: params.dateFrom ?? null,
      date_to: params.dateTo ?? null,
      shifts_deleted: params.shiftsDeleted,
      assignments_deleted: params.assignmentsDeleted,
      details: params.details ?? {},
    });

    if (error) {
      console.error('[auditoria] falha ao registrar exclusão de plantões:', error);
    }
  } catch (error) {
    console.error('[auditoria] falha ao registrar exclusão de plantões:', error);
  }
}
