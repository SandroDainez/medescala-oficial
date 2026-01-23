import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Hand, Check, X, Clock, Calendar, User, Building, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ShiftOffer {
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

export default function AdminOffers() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<ShiftOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<ShiftOffer | null>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (currentTenantId) {
      fetchOffers();
    }
  }, [currentTenantId]);

  async function fetchOffers() {
    if (!currentTenantId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('shift_offers')
      .select(`
        id, status, message, created_at, reviewed_at, user_id, shift_id,
        user:profiles!shift_offers_user_id_fkey(name),
        shift:shifts(id, title, hospital, shift_date, start_time, end_time, base_value, sector:sectors(name, color))
      `)
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching offers:', error);
    } else {
      setOffers(data as unknown as ShiftOffer[]);
    }
    
    setLoading(false);
  }

  async function handleApprove(offer: ShiftOffer) {
    if (!user || !currentTenantId) return;
    setProcessing(true);

    // 1. Update offer status to 'accepted' (valid values: pending, accepted, rejected)
    const { error: offerError } = await supabase
      .from('shift_offers')
      .update({
        status: 'accepted',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', offer.id);

    if (offerError) {
      toast({ title: 'Erro', description: offerError.message, variant: 'destructive' });
      setProcessing(false);
      return;
    }

    // 2. Create shift assignment
    const { error: assignError } = await supabase
      .from('shift_assignments')
      .insert({
        tenant_id: currentTenantId,
        shift_id: offer.shift_id,
        user_id: offer.user_id,
        assigned_value: offer.shift?.base_value || 0,
        status: 'assigned',
        created_by: user.id,
      });

    if (assignError) {
      toast({ title: 'Erro ao atribuir plantão', description: assignError.message, variant: 'destructive' });
      setProcessing(false);
      return;
    }

    // 3. Reject other pending offers for the same shift
    await supabase
      .from('shift_offers')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('shift_id', offer.shift_id)
      .eq('status', 'pending')
      .neq('id', offer.id);

    // 4. Create notification for the user
    await supabase
      .from('notifications')
      .insert({
        tenant_id: currentTenantId,
        user_id: offer.user_id,
        type: 'shift',
        title: 'Candidatura Aprovada!',
        message: `Sua candidatura para o plantão "${offer.shift?.title}" em ${format(parseISO(offer.shift?.shift_date || ''), 'dd/MM')} foi aprovada!`,
        shift_assignment_id: null,
      });

    setProcessing(false);
    setSelectedOffer(null);
    toast({ title: 'Candidatura aprovada!', description: 'O plantonista foi atribuído ao plantão.' });
    fetchOffers();
  }

  async function handleReject(offer: ShiftOffer) {
    if (!user || !currentTenantId) return;
    setProcessing(true);

    const { error } = await supabase
      .from('shift_offers')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', offer.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      // Notify user
      await supabase
        .from('notifications')
        .insert({
          tenant_id: currentTenantId,
          user_id: offer.user_id,
          type: 'shift',
          title: 'Candidatura Não Aprovada',
          message: `Sua candidatura para o plantão "${offer.shift?.title}" em ${format(parseISO(offer.shift?.shift_date || ''), 'dd/MM')} não foi aprovada desta vez.`,
        });

      toast({ title: 'Candidatura rejeitada' });
      fetchOffers();
    }
    
    setProcessing(false);
    setSelectedOffer(null);
  }

  async function handleDeleteSelected() {
    if (selectedForDelete.size === 0) return;
    setProcessing(true);

    const { error } = await supabase
      .from('shift_offers')
      .delete()
      .in('id', Array.from(selectedForDelete));

    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${selectedForDelete.size} candidatura(s) excluída(s)` });
      setSelectedForDelete(new Set());
      fetchOffers();
    }
    
    setProcessing(false);
    setDeleteDialogOpen(false);
  }

  function toggleSelectOffer(id: string) {
    setSelectedForDelete(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  function toggleSelectAll() {
    if (selectedForDelete.size === reviewedOffers.length) {
      setSelectedForDelete(new Set());
    } else {
      setSelectedForDelete(new Set(reviewedOffers.map(o => o.id)));
    }
  }

  const pendingOffers = offers.filter(o => o.status === 'pending');
  const reviewedOffers = offers.filter(o => o.status !== 'pending');

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500',
    accepted: 'bg-green-500/10 text-green-600 border-green-500',
    rejected: 'bg-red-500/10 text-red-600 border-red-500',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    accepted: 'Aprovado',
    rejected: 'Rejeitado',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Hand className="h-6 w-6 text-primary" />
            Candidaturas a Plantões
          </h1>
          <p className="text-muted-foreground">Gerencie as solicitações dos plantonistas</p>
        </div>
        {pendingOffers.length > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-2">
            {pendingOffers.length} pendente(s)
          </Badge>
        )}
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            <Clock className="mr-2 h-4 w-4" />
            Pendentes ({pendingOffers.length})
          </TabsTrigger>
          <TabsTrigger value="reviewed">
            <CheckCircle className="mr-2 h-4 w-4" />
            Histórico ({reviewedOffers.length})
          </TabsTrigger>
        </TabsList>

        {/* Pending Offers */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Candidaturas Pendentes</CardTitle>
              <CardDescription>Aprove ou rejeite as solicitações</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingOffers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma candidatura pendente</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plantonista</TableHead>
                      <TableHead>Plantão</TableHead>
                      <TableHead>Data/Horário</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Mensagem</TableHead>
                      <TableHead>Enviada em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingOffers.map(offer => (
                      <TableRow key={offer.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {offer.user?.name || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{offer.shift?.title}</p>
                            {offer.shift?.sector && (
                              <Badge 
                                variant="outline" 
                                className="mt-1"
                                style={{ 
                                  borderColor: offer.shift.sector.color,
                                  fontSize: '10px',
                                }}
                              >
                                {offer.shift.sector.name}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{offer.shift && format(parseISO(offer.shift.shift_date), 'dd/MM/yyyy')}</p>
                            <p className="text-muted-foreground">
                              {offer.shift?.start_time.slice(0, 5)} - {offer.shift?.end_time.slice(0, 5)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {offer.shift?.base_value ? (
                            <span className="font-medium text-green-600">
                              R$ {offer.shift.base_value.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {offer.message ? (
                            <span className="text-sm italic max-w-[150px] truncate block">
                              "{offer.message}"
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(parseISO(offer.created_at), "dd/MM HH:mm")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-green-600 hover:bg-green-50"
                              onClick={() => handleApprove(offer)}
                              disabled={processing}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Aprovar
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => setSelectedOffer(offer)}
                              disabled={processing}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Rejeitar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reviewed Offers */}
        <TabsContent value="reviewed">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Histórico de Candidaturas</CardTitle>
                <CardDescription>Candidaturas já processadas</CardDescription>
              </div>
              {selectedForDelete.size > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir ({selectedForDelete.size})
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {reviewedOffers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Nenhuma candidatura processada ainda</p>
                </div>
              ) : (
                <div className="h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={selectedForDelete.size === reviewedOffers.length && reviewedOffers.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Plantonista</TableHead>
                        <TableHead>Plantão</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Processada em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewedOffers.map(offer => (
                        <TableRow key={offer.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedForDelete.has(offer.id)}
                              onCheckedChange={() => toggleSelectOffer(offer.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusColors[offer.status]}>
                              {offer.status === 'accepted' && <CheckCircle className="h-3 w-3 mr-1" />}
                              {offer.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                              {statusLabels[offer.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{offer.user?.name || 'N/A'}</TableCell>
                          <TableCell>{offer.shift?.title}</TableCell>
                          <TableCell>
                            {offer.shift && format(parseISO(offer.shift.shift_date), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {offer.reviewed_at && format(parseISO(offer.reviewed_at), "dd/MM HH:mm")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject Confirmation Dialog */}
      <Dialog open={!!selectedOffer} onOpenChange={(open) => !open && setSelectedOffer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Candidatura</DialogTitle>
            <DialogDescription>
              Confirma a rejeição da candidatura de {selectedOffer?.user?.name} para o plantão "{selectedOffer?.shift?.title}"?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O plantonista será notificado sobre a decisão.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOffer(null)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => selectedOffer && handleReject(selectedOffer)}
              disabled={processing}
            >
              {processing ? 'Processando...' : 'Confirmar Rejeição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir Candidaturas
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir {selectedForDelete.size} candidatura(s) do histórico?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteSelected}
              disabled={processing}
            >
              {processing ? 'Excluindo...' : 'Confirmar Exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
