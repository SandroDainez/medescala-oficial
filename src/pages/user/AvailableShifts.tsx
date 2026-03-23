import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/errorMessage';
import { Calendar, Clock, MapPin, DollarSign, Hand, CheckCircle, XCircle, Loader2, Building } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useUserOffers } from '@/hooks/useUserOffers';
import type { AvailableShift } from '@/services/userOffers';

export default function UserAvailableShifts() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const {
    availableShifts,
    myOffers,
    memberSectorIds,
    isLoading,
    claimShift,
    cancelOffer: cancelUserOffer,
    isSubmitting,
  } = useUserOffers({
    userId: user?.id,
    tenantId: currentTenantId,
  });
  
  // Dialog state
  const [selectedShift, setSelectedShift] = useState<AvailableShift | null>(null);
  const [offerMessage, setOfferMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'available' | 'myoffers'>('available');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'available' || tab === 'myoffers') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  async function submitOffer() {
    if (!user || !currentTenantId || !selectedShift) return;

    const shiftSectorId = selectedShift.sector?.id ?? selectedShift.sector_id ?? null;
    if (!shiftSectorId || !memberSectorIds.has(shiftSectorId)) {
      toast({
        title: 'Sem permissão',
        description: 'Você só pode aceitar plantões do setor em que está cadastrado.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await claimShift({
        shift: selectedShift,
        offerMessage,
        memberSectorIds,
      });
    } catch (error) {
      console.error('Error claiming shift:', error);
      const backendMessage = extractErrorMessage(error, 'Não foi possível aceitar o plantão.');
      const isConflictError =
        backendMessage.toLowerCase().includes('conflito de horário') ||
        backendMessage.toLowerCase().includes('conflito de horario');
      toast({
        title: isConflictError ? 'Candidatura bloqueada por conflito' : 'Erro ao aceitar plantão',
        description: isConflictError
          ? `Você já possui outro plantão que conflita com "${selectedShift.title}" em ${format(parseISO(selectedShift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}, das ${selectedShift.start_time.slice(0, 5)} às ${selectedShift.end_time.slice(0, 5)}. O administrativo precisa regularizar esse conflito antes de liberar novas alocações.`
          : backendMessage,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Plantão aceito!',
      description: 'Seu nome já entrou na escala desse plantão.',
    });

    setSelectedShift(null);
    setOfferMessage('');

    navigate('/app/calendar');
  }

  async function cancelOffer(offerId: string) {
    try {
      await cancelUserOffer(offerId);
      toast({ title: 'Solicitação cancelada' });
    } catch (error) {
      toast({
        title: 'Erro ao cancelar',
        description: extractErrorMessage(error, 'Não foi possível cancelar a solicitação.'),
        variant: 'destructive',
      });
    }
  }

  // Check if user already has a pending offer for a shift
  function hasPendingOffer(shiftId: string): boolean {
    return myOffers.some(o => o.shift?.id === shiftId && o.status === 'pending');
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500',
    accepted: 'bg-green-500/10 text-green-600 border-green-500',
    rejected: 'bg-red-500/10 text-red-600 border-red-500',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    accepted: 'Aceita',
    rejected: 'Recusada',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Hand className="h-5 w-5 text-primary" />
          Anúncios e Candidaturas
        </h1>
        <p className="text-sm text-muted-foreground">Plantões disponíveis e vagos dos setores em que você está cadastrado</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'available' | 'myoffers')} className="space-y-4">
        <TabsList className="w-full">
          <TabsTrigger value="available" className="flex-1">
            Disponíveis ({availableShifts.length})
          </TabsTrigger>
          <TabsTrigger value="myoffers" className="flex-1">
            Minhas Candidaturas ({myOffers.length})
          </TabsTrigger>
        </TabsList>

        {/* Available Shifts */}
        <TabsContent value="available" className="space-y-4">
          {availableShifts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                <p className="text-muted-foreground">Todos os plantões estão cobertos!</p>
                <p className="text-sm text-muted-foreground mt-1">Volte mais tarde para ver novas oportunidades.</p>
              </CardContent>
            </Card>
          ) : (
            (() => {
              // Group shifts by sector
              const shiftsBySector = availableShifts.reduce((acc, shift) => {
                const sectorId = shift.sector?.id || 'no-sector';
                if (!acc[sectorId]) {
                  acc[sectorId] = {
                    sector: shift.sector,
                    shifts: [],
                  };
                }
                acc[sectorId].shifts.push(shift);
                return acc;
              }, {} as Record<string, { sector: AvailableShift['sector']; shifts: AvailableShift[] }>);

              // Sort shifts within each sector: day shifts first, then night shifts
              const isNightShift = (startTime: string) => {
                const hour = parseInt(startTime.slice(0, 2), 10);
                return hour >= 18 || hour < 6;
              };

              return Object.entries(shiftsBySector).map(([sectorId, { sector, shifts }]) => {
                const dayShifts = shifts.filter(s => !isNightShift(s.start_time));
                const nightShifts = shifts.filter(s => isNightShift(s.start_time));

                return (
                  <div key={sectorId} className="space-y-3">
                    {/* Sector Header */}
                    <div 
                      className="flex items-center gap-2 py-2 px-3 rounded-lg"
                      style={{ 
                        backgroundColor: sector?.color ? `${sector.color}15` : 'hsl(var(--muted))',
                        borderLeft: `4px solid ${sector?.color || 'hsl(var(--muted-foreground))'}`,
                      }}
                    >
                      <Building className="h-4 w-4" style={{ color: sector?.color }} />
                      <span className="font-semibold">{sector?.name || 'Sem Setor'}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {shifts.length} {shifts.length === 1 ? 'plantão' : 'plantões'}
                      </Badge>
                    </div>

                    {/* Day Shifts */}
                    {dayShifts.length > 0 && (
                      <div className="space-y-2 pl-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="inline-block w-3 h-3 rounded-full bg-yellow-400" />
                          Diurnos ({dayShifts.length})
                        </div>
                        {dayShifts.map(shift => {
                          const isPending = hasPendingOffer(shift.id);
                          return (
                            <Card key={shift.id} className="overflow-hidden">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold">{shift.title}</h3>
                                    <div className="mt-2">
                                      <Badge variant="outline" className={shift.open_kind === 'available' ? 'border-blue-500/50 bg-blue-500/10 text-blue-700' : 'border-amber-500/50 bg-amber-500/10 text-amber-700'}>
                                        {shift.open_kind === 'available' ? 'Disponível' : 'Vago'}
                                      </Badge>
                                    </div>
                                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        {format(parseISO(shift.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        {shift.start_time.slice(0, 5)} às {shift.end_time.slice(0, 5)}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4" />
                                        {shift.hospital}
                                        {shift.location && ` - ${shift.location}`}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    {shift.base_value && (
                                      <p className="text-lg font-bold text-green-600 flex items-center justify-end gap-1">
                                        <DollarSign className="h-4 w-4" />
                                        {shift.base_value.toFixed(2)}
                                      </p>
                                    )}
                                    {isPending ? (
                                      <Badge variant="outline" className="mt-2 bg-yellow-500/10 text-yellow-600">
                                        Candidatura pendente
                                      </Badge>
                                    ) : (
                                      <Button size="sm" className="mt-2" onClick={() => setSelectedShift(shift)}>
                                        <Hand className="h-4 w-4 mr-2" />
                                        Candidatar
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}

                    {/* Night Shifts */}
                    {nightShifts.length > 0 && (
                      <div className="space-y-2 pl-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="inline-block w-3 h-3 rounded-full bg-indigo-600" />
                          Noturnos ({nightShifts.length})
                        </div>
                        {nightShifts.map(shift => {
                          const isPending = hasPendingOffer(shift.id);
                          return (
                            <Card key={shift.id} className="overflow-hidden">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold">{shift.title}</h3>
                                    <div className="mt-2">
                                      <Badge variant="outline" className={shift.open_kind === 'available' ? 'border-blue-500/50 bg-blue-500/10 text-blue-700' : 'border-amber-500/50 bg-amber-500/10 text-amber-700'}>
                                        {shift.open_kind === 'available' ? 'Disponível' : 'Vago'}
                                      </Badge>
                                    </div>
                                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        {format(parseISO(shift.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        {shift.start_time.slice(0, 5)} às {shift.end_time.slice(0, 5)}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4" />
                                        {shift.hospital}
                                        {shift.location && ` - ${shift.location}`}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    {shift.base_value && (
                                      <p className="text-lg font-bold text-green-600 flex items-center justify-end gap-1">
                                        <DollarSign className="h-4 w-4" />
                                        {shift.base_value.toFixed(2)}
                                      </p>
                                    )}
                                    {isPending ? (
                                      <Badge variant="outline" className="mt-2 bg-yellow-500/10 text-yellow-600">
                                        Candidatura pendente
                                      </Badge>
                                    ) : (
                                      <Button size="sm" className="mt-2" onClick={() => setSelectedShift(shift)}>
                                        <Hand className="h-4 w-4 mr-2" />
                                        Candidatar
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </TabsContent>

        {/* My Offers */}
        <TabsContent value="myoffers" className="space-y-3">
          {myOffers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Hand className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Nenhuma candidatura no histórico</p>
                <p className="text-sm text-muted-foreground mt-1">Faça uma candidatura para registrar aqui.</p>
              </CardContent>
            </Card>
          ) : (
            myOffers.map(offer => (
              <Card key={offer.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Status Badge */}
                      <Badge 
                        variant="outline" 
                        className={statusColors[offer.status] || ''}
                      >
                        {offer.status === 'pending' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {offer.status === 'accepted' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {offer.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                        {statusLabels[offer.status] || offer.status}
                      </Badge>
                      
                      {/* Shift Info */}
                      {offer.shift && (
                        <>
                          <h3 className="font-semibold mt-2">{offer.shift.title}</h3>
                          <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {format(parseISO(offer.shift.shift_date), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {offer.shift.start_time.slice(0, 5)} - {offer.shift.end_time.slice(0, 5)}
                            </div>
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4" />
                              {offer.shift.hospital}
                            </div>
                            {offer.shift.sector?.name && (
                              <div className="flex items-center gap-2">
                                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: offer.shift.sector.color || '#94a3b8' }} />
                                {offer.shift.sector.name}
                              </div>
                            )}
                          </div>
                          {offer.message && (
                            <p className="mt-2 text-sm italic text-muted-foreground">
                              "{offer.message}"
                            </p>
                          )}
                        </>
                      )}
                      
                      <p className="text-xs text-muted-foreground mt-2">
                        Registrada em {format(parseISO(offer.created_at), "dd/MM 'às' HH:mm")}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="text-right shrink-0">
                      {offer.shift?.base_value && (
                        <p className="text-lg font-bold text-green-600">
                          R$ {offer.shift.base_value.toFixed(2)}
                        </p>
                      )}
                      
                      {offer.status === 'pending' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="mt-2 text-destructive hover:bg-destructive/10"
                          onClick={() => cancelOffer(offer.id)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Offer Dialog */}
      <Dialog open={!!selectedShift} onOpenChange={(open) => !open && setSelectedShift(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Candidatar ao Plantão</DialogTitle>
            <DialogDescription>
              Ao confirmar, seu nome entra imediatamente na escala deste plantão.
            </DialogDescription>
          </DialogHeader>

          {selectedShift && (
            <div className="space-y-4">
              {/* Shift Details */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold">{selectedShift.title}</h3>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {format(parseISO(selectedShift.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {selectedShift.start_time.slice(0, 5)} às {selectedShift.end_time.slice(0, 5)}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {selectedShift.hospital}
                    </div>
                  </div>
                  {selectedShift.base_value && (
                    <p className="mt-3 text-lg font-bold text-green-600">
                      R$ {selectedShift.base_value.toFixed(2)}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Message */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Mensagem (opcional)</label>
                <Textarea
                  placeholder="Observação sobre este aceite..."
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedShift(null)}>
              Cancelar
            </Button>
            <Button onClick={submitOffer} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Candidatando...
                </>
              ) : (
                <>
                  <Hand className="h-4 w-4 mr-2" />
                  Confirmar Candidatura
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
