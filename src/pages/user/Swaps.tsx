import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { ArrowRightLeft, Send, Calendar, Clock, MapPin, Check, X, User, Inbox, History } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Assignment {
  id: string;
  shift_id: string;
  shift: {
    title: string;
    hospital: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    sector?: { name: string; color: string | null } | null;
  };
}

interface TenantMember {
  user_id: string;
  name: string;
}

interface SwapRequest {
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
    };
  };
}

export default function UserSwaps() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  
  const [myAssignments, setMyAssignments] = useState<Assignment[]>([]);
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);
  const [mySwapRequests, setMySwapRequests] = useState<SwapRequest[]>([]);
  const [incomingSwapRequests, setIncomingSwapRequests] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectUserDialogOpen, setSelectUserDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedTargetUser, setSelectedTargetUser] = useState<TenantMember | null>(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (user && currentTenantId) {
      fetchData();
    }
  }, [user, currentTenantId]);

  async function fetchData() {
    setLoading(true);
    await Promise.all([
      fetchMyAssignments(),
      fetchTenantMembers(),
      fetchMySwapRequests(),
      fetchIncomingSwapRequests(),
    ]);
    setLoading(false);
  }

  async function fetchMyAssignments() {
    if (!currentTenantId || !user) return;
    const today = new Date().toISOString().split('T')[0];
    
    // First get all assignments for the user
    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        id, shift_id,
        shift:shifts(
          id, title, hospital, shift_date, start_time, end_time,
          sector:sectors(name, color)
        )
      `)
      .eq('tenant_id', currentTenantId)
      .eq('user_id', user.id)
      .in('status', ['assigned', 'confirmed']);
    
    if (error) {
      console.error('Error fetching assignments:', error);
      return;
    }
    
    if (data) {
      // Filter out null shifts and past dates (filter on frontend since nested column filter doesn't work)
      const validAssignments = data
        .filter((a: any) => a.shift !== null && a.shift.shift_date >= today)
        .sort((a: any, b: any) => a.shift.shift_date.localeCompare(b.shift.shift_date)) as unknown as Assignment[];
      setMyAssignments(validAssignments);
    }
  }

  async function fetchTenantMembers() {
    if (!currentTenantId) return;
    const { data } = await supabase.rpc('get_tenant_member_names', { _tenant_id: currentTenantId });
    if (data) {
      // Exclude current user from the list
      setTenantMembers(data.filter((m: TenantMember) => m.user_id !== user?.id));
    }
  }

  async function fetchMySwapRequests() {
    if (!currentTenantId || !user) return;
    const { data } = await supabase
      .from('swap_requests')
      .select(`
        id, status, reason, created_at, requester_id, target_user_id, origin_assignment_id,
        requester:profiles!swap_requests_requester_id_profiles_fkey(name),
        target_user:profiles!swap_requests_target_user_id_profiles_fkey(name),
        origin_assignment:shift_assignments!swap_requests_origin_assignment_id_fkey(
          id, user_id,
          shift:shifts(id, title, hospital, shift_date, start_time, end_time)
        )
      `)
      .eq('tenant_id', currentTenantId)
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false });
    
    if (data) setMySwapRequests(data as unknown as SwapRequest[]);
  }

  async function fetchIncomingSwapRequests() {
    if (!currentTenantId || !user) return;
    const { data } = await supabase
      .from('swap_requests')
      .select(`
        id, status, reason, created_at, requester_id, target_user_id, origin_assignment_id,
        requester:profiles!swap_requests_requester_id_profiles_fkey(name),
        target_user:profiles!swap_requests_target_user_id_profiles_fkey(name),
        origin_assignment:shift_assignments!swap_requests_origin_assignment_id_fkey(
          id, user_id,
          shift:shifts(id, title, hospital, shift_date, start_time, end_time)
        )
      `)
      .eq('tenant_id', currentTenantId)
      .eq('target_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (data) setIncomingSwapRequests(data as unknown as SwapRequest[]);
  }

  function handleShiftClick(assignment: Assignment) {
    setSelectedAssignment(assignment);
    setSelectUserDialogOpen(true);
  }

  function handleUserSelect(member: TenantMember) {
    setSelectedTargetUser(member);
    setSelectUserDialogOpen(false);
    setConfirmDialogOpen(true);
  }

  async function handleSubmitSwapRequest() {
    if (!selectedAssignment || !selectedTargetUser || !currentTenantId || !user) return;
    
    setProcessing(true);
    
    // Create swap request
    const { data: swapData, error: swapError } = await supabase
      .from('swap_requests')
      .insert({
        tenant_id: currentTenantId,
        origin_assignment_id: selectedAssignment.id,
        requester_id: user.id,
        target_user_id: selectedTargetUser.user_id,
        reason: reason || null,
      })
      .select()
      .single();

    if (swapError) {
      toast({ title: 'Erro', description: swapError.message, variant: 'destructive' });
      setProcessing(false);
      return;
    }

    // Send notification to target user
    const { error: notifyError } = await supabase
      .from('notifications')
      .insert({
        tenant_id: currentTenantId,
        user_id: selectedTargetUser.user_id,
        type: 'swap_request',
        title: 'Solicitação de Troca de Plantão',
        message: `${user.user_metadata?.name || 'Um colega'} quer passar o plantão "${selectedAssignment.shift.title}" do dia ${format(new Date(selectedAssignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })} para você. Acesse a área de Trocas para aceitar ou recusar.`,
      });

    if (notifyError) {
      console.error('Error sending notification:', notifyError);
    }

    toast({ title: 'Solicitação enviada!', description: `Aguardando ${selectedTargetUser.name} aceitar.` });
    
    setConfirmDialogOpen(false);
    setSelectedAssignment(null);
    setSelectedTargetUser(null);
    setReason('');
    setProcessing(false);
    
    fetchData();
  }

  async function handleAcceptSwap(swap: SwapRequest) {
    if (!currentTenantId || !user) return;
    
    setProcessing(true);

    // Update swap status to approved
    const { error: updateError } = await supabase
      .from('swap_requests')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', swap.id);

    if (updateError) {
      toast({ title: 'Erro', description: updateError.message, variant: 'destructive' });
      setProcessing(false);
      return;
    }

    // Update the shift assignment - change user_id to target user
    const { error: assignmentError } = await supabase
      .from('shift_assignments')
      .update({
        user_id: user.id,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', swap.origin_assignment_id);

    if (assignmentError) {
      toast({ title: 'Erro ao atualizar escala', description: assignmentError.message, variant: 'destructive' });
      setProcessing(false);
      return;
    }

    // Notify the requester that their swap was accepted
    await supabase.from('notifications').insert({
      tenant_id: currentTenantId,
      user_id: swap.requester_id,
      type: 'swap_accepted',
      title: 'Troca Aceita!',
      message: `${user.user_metadata?.name || 'O colega'} aceitou assumir o plantão "${swap.origin_assignment.shift.title}" do dia ${format(new Date(swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}.`,
    });

    // Notify all admins about the swap
    const { data: admins } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', currentTenantId)
      .eq('role', 'admin')
      .eq('active', true);

    if (admins) {
      for (const admin of admins) {
        await supabase.from('notifications').insert({
          tenant_id: currentTenantId,
          user_id: admin.user_id,
          type: 'swap_completed',
          title: 'Troca de Plantão Realizada',
          message: `${swap.requester?.name || 'Plantonista'} passou o plantão "${swap.origin_assignment.shift.title}" do dia ${format(new Date(swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })} para ${user.user_metadata?.name || 'outro plantonista'}.`,
        });
      }
    }

    toast({ title: 'Troca aceita!', description: 'O plantão foi transferido para você.' });
    setProcessing(false);
    fetchData();
  }

  async function handleRejectSwap(swap: SwapRequest) {
    if (!currentTenantId || !user) return;
    
    setProcessing(true);

    const { error } = await supabase
      .from('swap_requests')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', swap.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      setProcessing(false);
      return;
    }

    // Notify the requester
    await supabase.from('notifications').insert({
      tenant_id: currentTenantId,
      user_id: swap.requester_id,
      type: 'swap_rejected',
      title: 'Troca Recusada',
      message: `${user.user_metadata?.name || 'O colega'} recusou assumir o plantão "${swap.origin_assignment.shift.title}" do dia ${format(new Date(swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}.`,
    });

    toast({ title: 'Troca recusada.' });
    setProcessing(false);
    fetchData();
  }

  async function handleCancelRequest(swapId: string) {
    const { error } = await supabase
      .from('swap_requests')
      .update({ status: 'cancelled' })
      .eq('id', swapId);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Solicitação cancelada.' });
      fetchData();
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    approved: 'bg-green-500/10 text-green-600 border-green-500/30',
    rejected: 'bg-red-500/10 text-red-600 border-red-500/30',
    cancelled: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovada',
    rejected: 'Recusada',
    cancelled: 'Cancelada',
  };

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Trocas de Plantão</h2>
        <p className="text-muted-foreground">Passe ou troque plantões com colegas</p>
      </div>

      <Tabs defaultValue="my-shifts" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="my-shifts" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Passar Plantão</span>
            <span className="sm:hidden">Passar</span>
          </TabsTrigger>
          <TabsTrigger value="incoming" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Recebidas</span>
            <span className="sm:hidden">Recebidas</span>
            {incomingSwapRequests.length > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5">
                {incomingSwapRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Histórico</span>
            <span className="sm:hidden">Histórico</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab: Passar Plantão */}
        <TabsContent value="my-shifts" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Meus Plantões</CardTitle>
              <p className="text-sm text-muted-foreground">
                Clique em um plantão para passá-lo a outro colega
              </p>
            </CardHeader>
            <CardContent>
              {myAssignments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Você não tem plantões futuros para passar.
                </p>
              ) : (
                <div className="grid gap-3">
                  {myAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      onClick={() => handleShiftClick(assignment)}
                      className="p-4 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="font-medium">{assignment.shift.title}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(assignment.shift.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {assignment.shift.start_time.slice(0, 5)} - {assignment.shift.end_time.slice(0, 5)}
                          </div>
                          {assignment.shift.sector && (
                            <Badge
                              variant="outline"
                              className="text-xs mt-1"
                              style={{
                                borderColor: assignment.shift.sector.color || '#22c55e',
                                backgroundColor: `${assignment.shift.sector.color || '#22c55e'}20`,
                              }}
                            >
                              {assignment.shift.sector.name}
                            </Badge>
                          )}
                        </div>
                        <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Solicitações Recebidas */}
        <TabsContent value="incoming" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Solicitações Recebidas</CardTitle>
              <p className="text-sm text-muted-foreground">
                Colegas que querem passar plantões para você
              </p>
            </CardHeader>
            <CardContent>
              {incomingSwapRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma solicitação pendente.
                </p>
              ) : (
                <div className="grid gap-3">
                  {incomingSwapRequests.map((swap) => (
                    <div key={swap.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-primary" />
                            <span className="font-medium">{swap.requester?.name}</span>
                            <span className="text-muted-foreground">quer passar:</span>
                          </div>
                          <div className="pl-6 space-y-1">
                            <div className="font-medium">{swap.origin_assignment?.shift?.title}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {swap.origin_assignment?.shift?.shift_date &&
                                format(new Date(swap.origin_assignment.shift.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {swap.origin_assignment?.shift?.start_time?.slice(0, 5)} - {swap.origin_assignment?.shift?.end_time?.slice(0, 5)}
                            </div>
                            {swap.reason && (
                              <div className="text-sm text-muted-foreground italic mt-2">
                                "{swap.reason}"
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          onClick={() => handleAcceptSwap(swap)}
                          disabled={processing}
                          className="flex-1"
                          size="sm"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Aceitar
                        </Button>
                        <Button
                          onClick={() => handleRejectSwap(swap)}
                          disabled={processing}
                          variant="outline"
                          className="flex-1"
                          size="sm"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Recusar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Histórico */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Minhas Solicitações</CardTitle>
              <p className="text-sm text-muted-foreground">
                Histórico de plantões que você solicitou passar
              </p>
            </CardHeader>
            <CardContent>
              {mySwapRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma solicitação enviada.
                </p>
              ) : (
                <div className="grid gap-3">
                  {mySwapRequests.map((swap) => (
                    <div key={swap.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="font-medium">{swap.origin_assignment?.shift?.title}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {swap.origin_assignment?.shift?.shift_date &&
                              format(new Date(swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Para: <span className="font-medium">{swap.target_user?.name || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge className={statusColors[swap.status]} variant="outline">
                            {statusLabels[swap.status]}
                          </Badge>
                          {swap.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelRequest(swap.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Selecionar Usuário */}
      <Dialog open={selectUserDialogOpen} onOpenChange={setSelectUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Passar Plantão</DialogTitle>
            <DialogDescription>
              Selecione o colega que assumirá este plantão
            </DialogDescription>
          </DialogHeader>
          {selectedAssignment && (
            <div className="p-3 bg-muted rounded-lg mb-4">
              <div className="font-medium">{selectedAssignment.shift.title}</div>
              <div className="text-sm text-muted-foreground">
                {format(new Date(selectedAssignment.shift.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedAssignment.shift.start_time.slice(0, 5)} - {selectedAssignment.shift.end_time.slice(0, 5)}
              </div>
            </div>
          )}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {tenantMembers.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhum colega disponível.
              </p>
            ) : (
              tenantMembers.map((member) => (
                <div
                  key={member.user_id}
                  onClick={() => handleUserSelect(member)}
                  className="p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors flex items-center gap-3"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-medium">{member.name}</span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar Solicitação */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Solicitação</DialogTitle>
            <DialogDescription>
              Uma notificação será enviada para {selectedTargetUser?.name} solicitando que aceite o plantão.
            </DialogDescription>
          </DialogHeader>
          {selectedAssignment && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="font-medium">{selectedAssignment.shift.title}</div>
              <div className="text-sm text-muted-foreground">
                {format(new Date(selectedAssignment.shift.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedAssignment.shift.start_time.slice(0, 5)} - {selectedAssignment.shift.end_time.slice(0, 5)}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea
              placeholder="Explique o motivo da troca..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitSwapRequest}
              disabled={processing}
              className="flex-1"
            >
              {processing ? 'Enviando...' : 'Enviar Solicitação'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
