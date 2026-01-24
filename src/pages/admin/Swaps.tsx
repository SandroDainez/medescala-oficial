import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Check, X, ArrowLeftRight, Hand, Clock, MapPin, Calendar, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SwapRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
  admin_notes: string | null;
  created_at: string;
  requester: { name: string | null };
  target_user: { name: string | null } | null;
  origin_assignment: { shift: { title: string; hospital: string; shift_date: string; start_time: string; end_time: string } };
}

interface ShiftOffer {
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

export default function AdminSwaps() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [offers, setOffers] = useState<ShiftOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSwap, setSelectedSwap] = useState<SwapRequest | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<ShiftOffer | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [selectedSwapsForDelete, setSelectedSwapsForDelete] = useState<Set<string>>(new Set());
  const [selectedOffersForDelete, setSelectedOffersForDelete] = useState<Set<string>>(new Set());
  const [deleteSwapsDialogOpen, setDeleteSwapsDialogOpen] = useState(false);
  const [deleteOffersDialogOpen, setDeleteOffersDialogOpen] = useState(false);

  useEffect(() => {
    if (currentTenantId) {
      fetchSwaps();
      fetchOffers();
    }
  }, [currentTenantId]);

  async function fetchSwaps() {
    if (!currentTenantId) return;
    const { data } = await supabase
      .from('swap_requests')
      .select(`
        id, status, reason, admin_notes, created_at, 
        requester:profiles!swap_requests_requester_id_profiles_fkey(name), 
        target_user:profiles!swap_requests_target_user_id_profiles_fkey(name), 
        origin_assignment:shift_assignments!swap_requests_origin_assignment_id_fkey(
          shift:shifts(title, hospital, shift_date, start_time, end_time)
        )
      `)
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });
    if (data) setSwaps(data as unknown as SwapRequest[]);
    setLoading(false);
  }

  async function fetchOffers() {
    if (!currentTenantId) return;
    const { data } = await supabase
      .from('shift_offers')
      .select(`
        id, shift_id, user_id, message, status, created_at,
        profile:profiles!shift_offers_user_id_fkey(name),
        shift:shifts!shift_offers_shift_id_fkey(
          title, hospital, shift_date, start_time, end_time,
          sector:sectors(name, color)
        )
      `)
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });
    if (data) setOffers(data as unknown as ShiftOffer[]);
  }

  async function handleSwapAction(action: 'approved' | 'rejected') {
    if (!selectedSwap) return;
    const { error } = await supabase
      .from('swap_requests')
      .update({ 
        status: action, 
        admin_notes: adminNotes || null, 
        reviewed_by: user?.id, 
        reviewed_at: new Date().toISOString() 
      })
      .eq('id', selectedSwap.id);
    
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: action === 'approved' ? 'Troca aprovada!' : 'Troca rejeitada!' });
      fetchSwaps();
      setSwapDialogOpen(false);
      setSelectedSwap(null);
      setAdminNotes('');
    }
  }

  async function handleOfferAction(action: 'accepted' | 'rejected') {
    if (!selectedOffer || !currentTenantId) return;
    
    const { error: updateError } = await supabase
      .from('shift_offers')
      .update({ 
        status: action, 
        reviewed_by: user?.id, 
        reviewed_at: new Date().toISOString() 
      })
      .eq('id', selectedOffer.id);
    
    if (updateError) {
      toast({ title: 'Erro', description: updateError.message, variant: 'destructive' });
      return;
    }

    // If accepted, create the shift assignment
    if (action === 'accepted') {
      // First, get the shift details to get base_value
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('base_value')
        .eq('id', selectedOffer.shift_id)
        .single();

      // Create the assignment
      const { error: assignError } = await supabase
        .from('shift_assignments')
        .insert({
          tenant_id: currentTenantId,
          shift_id: selectedOffer.shift_id,
          user_id: selectedOffer.user_id,
          assigned_value: shiftData?.base_value || 0,
          created_by: user?.id,
        });

      if (assignError) {
        // Check if it's a duplicate
        if (assignError.code === '23505') {
          toast({ title: 'Aviso', description: 'Este plantonista já está atribuído a este plantão', variant: 'destructive' });
        } else {
          toast({ title: 'Erro ao atribuir', description: assignError.message, variant: 'destructive' });
        }
      } else {
        // Update shift notes to remove [DISPONÍVEL] status
        await supabase
          .from('shifts')
          .update({ 
            notes: null,
            updated_by: user?.id 
          })
          .eq('id', selectedOffer.shift_id);
        
        // Reject all other pending offers for the same shift
        await supabase
          .from('shift_offers')
          .update({ 
            status: 'rejected', 
            reviewed_by: user?.id, 
            reviewed_at: new Date().toISOString() 
          })
          .eq('shift_id', selectedOffer.shift_id)
          .eq('status', 'pending')
          .neq('id', selectedOffer.id);
      }
    }

    toast({ title: action === 'accepted' ? 'Oferta aceita! Plantonista atribuído.' : 'Oferta rejeitada!' });
    fetchOffers();
    setOfferDialogOpen(false);
    setSelectedOffer(null);
  }

  function openSwapDialog(swap: SwapRequest, action: 'approve' | 'reject') {
    setSelectedSwap(swap);
    setActionType(action);
    setAdminNotes('');
    setSwapDialogOpen(true);
  }

  function openOfferDialog(offer: ShiftOffer, action: 'approve' | 'reject') {
    setSelectedOffer(offer);
    setActionType(action);
    setOfferDialogOpen(true);
  }

  // Delete functions for offers
  async function handleDeleteOffers() {
    if (selectedOffersForDelete.size === 0) return;

    const { error } = await supabase
      .from('shift_offers')
      .delete()
      .in('id', Array.from(selectedOffersForDelete));

    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${selectedOffersForDelete.size} oferta(s) excluída(s)` });
      setSelectedOffersForDelete(new Set());
      fetchOffers();
    }
    setDeleteOffersDialogOpen(false);
  }

  // Delete functions for swaps
  async function handleDeleteSwaps() {
    if (selectedSwapsForDelete.size === 0) return;

    const { error } = await supabase
      .from('swap_requests')
      .delete()
      .in('id', Array.from(selectedSwapsForDelete));

    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${selectedSwapsForDelete.size} troca(s) excluída(s)` });
      setSelectedSwapsForDelete(new Set());
      fetchSwaps();
    }
    setDeleteSwapsDialogOpen(false);
  }

  function toggleSelectOffer(id: string) {
    setSelectedOffersForDelete(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  function toggleSelectSwap(id: string) {
    setSelectedSwapsForDelete(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  const reviewedOffers = offers.filter(o => o.status !== 'pending');
  const reviewedSwaps = swaps.filter(s => s.status !== 'pending');

  function toggleSelectAllOffers() {
    if (selectedOffersForDelete.size === reviewedOffers.length) {
      setSelectedOffersForDelete(new Set());
    } else {
      setSelectedOffersForDelete(new Set(reviewedOffers.map(o => o.id)));
    }
  }

  function toggleSelectAllSwaps() {
    if (selectedSwapsForDelete.size === reviewedSwaps.length) {
      setSelectedSwapsForDelete(new Set());
    } else {
      setSelectedSwapsForDelete(new Set(reviewedSwaps.map(s => s.id)));
    }
  }

  const statusColors = { 
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', 
    approved: 'bg-green-500/10 text-green-600 border-green-500/30', 
    rejected: 'bg-red-500/10 text-red-600 border-red-500/30', 
    cancelled: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
    accepted: 'bg-green-500/10 text-green-600 border-green-500/30',
  };
  const statusLabels = { 
    pending: 'Pendente', 
    approved: 'Aprovada', 
    rejected: 'Rejeitada', 
    cancelled: 'Cancelada',
    accepted: 'Aceita',
  };

  const pendingSwaps = swaps.filter(s => s.status === 'pending');
  const pendingOffers = offers.filter(o => o.status === 'pending');

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Trocas e Ofertas</h2>
        <p className="text-muted-foreground">Gerencie solicitações de troca e ofertas para plantões disponíveis</p>
      </div>

      <Tabs defaultValue="offers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="offers" className="flex items-center gap-2">
            <Hand className="h-4 w-4" />
            Ofertas
            {pendingOffers.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                {pendingOffers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="swaps" className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Trocas
            {pendingSwaps.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                {pendingSwaps.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Offers Tab */}
        <TabsContent value="offers" className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Hand className="h-5 w-5 text-primary" />
                  Plantonistas Oferecendo-se
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Plantonistas que clicaram em plantões disponíveis oferecendo-se para trabalhar
                </p>
              </div>
              {selectedOffersForDelete.size > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setDeleteOffersDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir ({selectedOffersForDelete.size})
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedOffersForDelete.size === reviewedOffers.length && reviewedOffers.length > 0}
                        onCheckedChange={toggleSelectAllOffers}
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Plantonista</TableHead>
                    <TableHead>Plantão</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhuma oferta recebida
                      </TableCell>
                    </TableRow>
                  ) : (
                    offers.map((offer) => (
                      <TableRow key={offer.id}>
                        <TableCell>
                          {offer.status !== 'pending' && (
                            <Checkbox
                              checked={selectedOffersForDelete.has(offer.id)}
                              onCheckedChange={() => toggleSelectOffer(offer.id)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(offer.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {offer.profile?.name || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{offer.shift?.title}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(offer.shift?.shift_date), 'dd/MM/yyyy', { locale: ptBR })}
                              <Clock className="h-3 w-3 ml-2" />
                              {offer.shift?.start_time?.slice(0, 5)} - {offer.shift?.end_time?.slice(0, 5)}
                            </div>
                            {offer.shift?.sector && (
                              <Badge 
                                variant="outline" 
                                className="text-xs"
                                style={{ 
                                  borderColor: offer.shift.sector.color || '#22c55e',
                                  backgroundColor: `${offer.shift.sector.color || '#22c55e'}20`
                                }}
                              >
                                {offer.shift.sector.name}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {offer.message ? (
                            <p className="text-sm truncate" title={offer.message}>
                              "{offer.message}"
                            </p>
                          ) : (
                            <span className="text-muted-foreground text-sm italic">Sem mensagem</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[offer.status]} variant="outline">
                            {statusLabels[offer.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {offer.status === 'pending' && (
                            <div className="flex justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => openOfferDialog(offer, 'approve')}
                                title="Aceitar oferta"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openOfferDialog(offer, 'reject')}
                                title="Rejeitar oferta"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Swaps Tab */}
        <TabsContent value="swaps" className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5 text-primary" />
                  Solicitações de Troca
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Plantonistas solicitando troca de plantão com outro colega
                </p>
              </div>
              {selectedSwapsForDelete.size > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setDeleteSwapsDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir ({selectedSwapsForDelete.size})
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedSwapsForDelete.size === reviewedSwaps.length && reviewedSwaps.length > 0}
                        onCheckedChange={toggleSelectAllSwaps}
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Plantão</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {swaps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhuma solicitação de troca
                      </TableCell>
                    </TableRow>
                  ) : (
                    swaps.map((swap) => (
                      <TableRow key={swap.id}>
                        <TableCell>
                          {swap.status !== 'pending' && (
                            <Checkbox
                              checked={selectedSwapsForDelete.has(swap.id)}
                              onCheckedChange={() => toggleSelectSwap(swap.id)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(swap.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {swap.requester?.name || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{swap.origin_assignment?.shift?.title}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {swap.origin_assignment?.shift?.shift_date && 
                                format(new Date(swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {swap.reason ? (
                            <p className="text-sm truncate" title={swap.reason}>
                              "{swap.reason}"
                            </p>
                          ) : (
                            <span className="text-muted-foreground text-sm italic">Sem motivo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[swap.status]} variant="outline">
                            {statusLabels[swap.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {swap.status === 'pending' && (
                            <div className="flex justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => openSwapDialog(swap, 'approve')}
                                title="Aprovar troca"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openSwapDialog(swap, 'reject')}
                                title="Rejeitar troca"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Swap Dialog */}
      <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Aprovar Troca' : 'Rejeitar Troca'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedSwap && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Solicitante:</span>
                  <span>{selectedSwap.requester?.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Plantão:</span>
                  <span>{selectedSwap.origin_assignment?.shift?.title}</span>
                </div>
                {selectedSwap.reason && (
                  <div className="text-sm">
                    <span className="font-medium">Motivo:</span>
                    <p className="text-muted-foreground mt-1">{selectedSwap.reason}</p>
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Observações (opcional):</label>
              <Textarea 
                value={adminNotes} 
                onChange={(e) => setAdminNotes(e.target.value)} 
                placeholder="Adicione uma observação..." 
              />
            </div>
            
            <div className="flex gap-2">
              {actionType === 'approve' ? (
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleSwapAction('approved')}>
                  <Check className="mr-2 h-4 w-4" />
                  Confirmar Aprovação
                </Button>
              ) : (
                <Button variant="destructive" className="flex-1" onClick={() => handleSwapAction('rejected')}>
                  <X className="mr-2 h-4 w-4" />
                  Confirmar Rejeição
                </Button>
              )}
              <Button variant="outline" onClick={() => setSwapDialogOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Offer Dialog */}
      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Aceitar Oferta' : 'Rejeitar Oferta'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedOffer && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Plantonista:</span>
                  <span className="text-primary font-semibold">{selectedOffer.profile?.name}</span>
                </div>
                <div className="text-sm space-y-1">
                  <span className="font-medium">Plantão:</span>
                  <div className="pl-2 border-l-2 border-primary/50 mt-1">
                    <p className="font-medium">{selectedOffer.shift?.title}</p>
                    <p className="text-muted-foreground text-xs flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(selectedOffer.shift?.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </p>
                    <p className="text-muted-foreground text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {selectedOffer.shift?.start_time?.slice(0, 5)} - {selectedOffer.shift?.end_time?.slice(0, 5)}
                    </p>
                    <p className="text-muted-foreground text-xs flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedOffer.shift?.hospital}
                    </p>
                  </div>
                </div>
                {selectedOffer.message && (
                  <div className="text-sm">
                    <span className="font-medium">Mensagem do plantonista:</span>
                    <p className="text-muted-foreground mt-1 italic">"{selectedOffer.message}"</p>
                  </div>
                )}
              </div>
            )}
            
            {actionType === 'approve' && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                <strong>Ao aceitar:</strong> O plantonista será automaticamente atribuído a este plantão e outras ofertas pendentes serão rejeitadas.
              </div>
            )}
            
            <div className="flex gap-2">
              {actionType === 'approve' ? (
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleOfferAction('accepted')}>
                  <Check className="mr-2 h-4 w-4" />
                  Aceitar e Atribuir
                </Button>
              ) : (
                <Button variant="destructive" className="flex-1" onClick={() => handleOfferAction('rejected')}>
                  <X className="mr-2 h-4 w-4" />
                  Rejeitar Oferta
                </Button>
              )}
              <Button variant="outline" onClick={() => setOfferDialogOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Offers Confirmation Dialog */}
      <Dialog open={deleteOffersDialogOpen} onOpenChange={setDeleteOffersDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir Ofertas
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir {selectedOffersForDelete.size} oferta(s) do histórico?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOffersDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteOffers}>
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Swaps Confirmation Dialog */}
      <Dialog open={deleteSwapsDialogOpen} onOpenChange={setDeleteSwapsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir Trocas
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir {selectedSwapsForDelete.size} troca(s) do histórico?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSwapsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteSwaps}>
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
