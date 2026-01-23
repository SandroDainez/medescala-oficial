import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Lock, Unlock, History, ArrowRight, UserMinus, ArrowRightLeft, UserPlus, AlertTriangle, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ScheduleFinalization {
  id: string;
  tenant_id: string;
  month: number;
  year: number;
  finalized_at: string;
  finalized_by: string;
  notes: string | null;
}

interface ScheduleMovement {
  id: string;
  tenant_id: string;
  month: number;
  year: number;
  user_id: string;
  user_name: string;
  movement_type: 'transferred' | 'removed' | 'added';
  source_sector_id: string | null;
  source_sector_name: string | null;
  source_shift_date: string | null;
  source_shift_time: string | null;
  source_assignment_id: string | null;
  destination_sector_id: string | null;
  destination_sector_name: string | null;
  destination_shift_date: string | null;
  destination_shift_time: string | null;
  destination_assignment_id: string | null;
  reason: string | null;
  performed_by: string;
  performed_at: string;
}

interface ScheduleMovementsProps {
  currentMonth: number;
  currentYear: number;
}

export default function ScheduleMovements({ currentMonth, currentYear }: ScheduleMovementsProps) {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();

  const [finalization, setFinalization] = useState<ScheduleFinalization | null>(null);
  const [movements, setMovements] = useState<ScheduleMovement[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialogs
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [finalizeNotes, setFinalizeNotes] = useState('');
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  useEffect(() => {
    if (currentTenantId && user?.id) {
      fetchData();
    }
  }, [currentTenantId, user?.id, currentMonth, currentYear]);

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);

    try {
      const [finalizationRes, movementsRes] = await Promise.all([
        supabase
          .from('schedule_finalizations')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .eq('month', currentMonth)
          .eq('year', currentYear)
          .maybeSingle(),
        supabase
          .from('schedule_movements')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .eq('month', currentMonth)
          .eq('year', currentYear)
          .order('performed_at', { ascending: false }),
      ]);

      if (finalizationRes.error) throw finalizationRes.error;
      if (movementsRes.error) throw movementsRes.error;

      setFinalization(finalizationRes.data);
      setMovements((movementsRes.data ?? []) as ScheduleMovement[]);
    } catch (error: any) {
      console.error('Error fetching schedule data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalizeSchedule() {
    if (!currentTenantId || !user?.id) return;

    try {
      const { error } = await supabase
        .from('schedule_finalizations')
        .insert({
          tenant_id: currentTenantId,
          month: currentMonth,
          year: currentYear,
          finalized_by: user.id,
          notes: finalizeNotes || null,
        });

      if (error) throw error;

      toast({
        title: 'Escala finalizada!',
        description: 'A escala foi marcada como concluída. Qualquer movimentação será registrada.',
      });
      setFinalizeDialogOpen(false);
      setFinalizeNotes('');
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Erro ao finalizar',
        description: error?.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  }

  async function handleReopenSchedule() {
    if (!currentTenantId || !finalization?.id) return;

    try {
      const { error } = await supabase
        .from('schedule_finalizations')
        .delete()
        .eq('id', finalization.id);

      if (error) throw error;

      toast({
        title: 'Escala reaberta',
        description: 'A escala pode ser editada novamente sem registro de movimentações.',
      });
      setReopenDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Erro ao reabrir',
        description: error?.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  }

  function getMovementIcon(type: string) {
    switch (type) {
      case 'transferred':
        return <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
      case 'removed':
        return <UserMinus className="h-4 w-4 text-red-600" />;
      case 'added':
        return <UserPlus className="h-4 w-4 text-green-600" />;
      default:
        return null;
    }
  }

  function getMovementLabel(type: string) {
    switch (type) {
      case 'transferred':
        return 'Transferido';
      case 'removed':
        return 'Removido';
      case 'added':
        return 'Adicionado';
      default:
        return type;
    }
  }

  function getMovementBadgeVariant(type: string): 'default' | 'destructive' | 'secondary' {
    switch (type) {
      case 'transferred':
        return 'secondary';
      case 'removed':
        return 'destructive';
      case 'added':
        return 'default';
      default:
        return 'secondary';
    }
  }

  const monthName = format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy', { locale: ptBR });

  if (loading) {
    return null;
  }

  return (
    <>
      {/* Status Card - Shows finalization status */}
      <Card className={finalization ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'}>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {finalization ? (
                <>
                  <Lock className="h-5 w-5 text-green-600" />
                  <div>
                    <span className="font-bold text-green-700 dark:text-green-400">
                      ✅ Escala Finalizada
                    </span>
                    <p className="text-sm text-muted-foreground">
                      Finalizada em {format(parseISO(finalization.finalized_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Unlock className="h-5 w-5 text-amber-600" />
                  <div>
                    <span className="font-bold text-amber-700 dark:text-amber-400">
                      📝 Escala em edição
                    </span>
                    <p className="text-sm text-muted-foreground">
                      Finalize a escala para começar a registrar movimentações
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {finalization ? (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setHistoryDialogOpen(true)}
                    disabled={movements.length === 0}
                  >
                    <History className="mr-2 h-4 w-4" />
                    Movimentações ({movements.length})
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setReopenDialogOpen(true)}
                  >
                    <Unlock className="mr-2 h-4 w-4" />
                    Reabrir
                  </Button>
                </>
              ) : (
                <Button 
                  size="sm"
                  onClick={() => setFinalizeDialogOpen(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Finalizar Escala
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Finalize Dialog */}
      <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Finalizar Escala - {monthName}
            </DialogTitle>
            <DialogDescription>
              Ao finalizar a escala, qualquer movimentação de plantonistas (remoção, transferência ou adição) 
              será registrada automaticamente para auditoria.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-medium">O que será registrado após a finalização:</p>
                  <ul className="mt-2 space-y-1 list-disc list-inside">
                    <li>Plantonistas removidos de setores</li>
                    <li>Plantonistas transferidos entre setores</li>
                    <li>Novos plantonistas adicionados</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="finalize-notes">Observações (opcional)</Label>
              <Textarea
                id="finalize-notes"
                placeholder="Ex: Escala revisada pela coordenação..."
                value={finalizeNotes}
                onChange={(e) => setFinalizeNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setFinalizeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleFinalizeSchedule}>
              <Lock className="mr-2 h-4 w-4" />
              Finalizar Escala
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reopen Dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-amber-600" />
              Reabrir Escala - {monthName}
            </DialogTitle>
            <DialogDescription>
              Ao reabrir a escala, as movimentações não serão mais registradas até que você finalize novamente.
              O histórico de movimentações existentes será mantido.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setReopenDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleReopenSchedule}>
              <Unlock className="mr-2 h-4 w-4" />
              Reabrir Escala
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movements History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Histórico de Movimentações - {monthName}
            </DialogTitle>
            <DialogDescription>
              Registro de todas as movimentações de plantonistas após a finalização da escala.
            </DialogDescription>
          </DialogHeader>

          {movements.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Nenhuma movimentação registrada.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Plantonista</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(parseISO(movement.performed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">{movement.user_name}</TableCell>
                    <TableCell>
                      <Badge variant={getMovementBadgeVariant(movement.movement_type)} className="flex items-center gap-1 w-fit">
                        {getMovementIcon(movement.movement_type)}
                        {getMovementLabel(movement.movement_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {movement.source_sector_name ? (
                        <div>
                          <p className="font-medium">{movement.source_sector_name}</p>
                          {movement.source_shift_date && (
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(movement.source_shift_date), "dd/MM", { locale: ptBR })}
                              {movement.source_shift_time && ` - ${movement.source_shift_time}`}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {movement.destination_sector_name ? (
                        <div>
                          <p className="font-medium">{movement.destination_sector_name}</p>
                          {movement.destination_shift_date && (
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(movement.destination_shift_date), "dd/MM", { locale: ptBR })}
                              {movement.destination_shift_time && ` - ${movement.destination_shift_time}`}
                            </p>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-300">
                          Sem destino
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={movement.reason || ''}>
                      {movement.reason || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Helper function to record a movement (to be called from ShiftCalendar)
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
    // First check if schedule is finalized
    const { data: finalization } = await supabase
      .from('schedule_finalizations')
      .select('id')
      .eq('tenant_id', params.tenant_id)
      .eq('month', params.month)
      .eq('year', params.year)
      .maybeSingle();

    // Only record if schedule is finalized
    if (!finalization) {
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

// Helper to check if schedule is finalized
export async function isScheduleFinalized(tenant_id: string, month: number, year: number): Promise<boolean> {
  const { data } = await supabase
    .from('schedule_finalizations')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle();
  
  return !!data;
}
