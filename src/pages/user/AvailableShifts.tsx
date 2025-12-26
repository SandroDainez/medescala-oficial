import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, MapPin, DollarSign, Hand, CheckCircle, XCircle, Loader2, Building } from 'lucide-react';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AvailableShift {
  id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  base_value: number | null;
  sector: { id: string; name: string; color: string } | null;
}

interface MyOffer {
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

export default function UserAvailableShifts() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [availableShifts, setAvailableShifts] = useState<AvailableShift[]>([]);
  const [myOffers, setMyOffers] = useState<MyOffer[]>([]);
  const [myAssignedShiftIds, setMyAssignedShiftIds] = useState<Set<string>>(new Set());
  
  // Dialog state
  const [selectedShift, setSelectedShift] = useState<AvailableShift | null>(null);
  const [offerMessage, setOfferMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && currentTenantId) {
      fetchData();
    }
  }, [user, currentTenantId]);

  async function fetchData() {
    if (!user || !currentTenantId) return;
    setLoading(true);

    const today = startOfDay(new Date()).toISOString().split('T')[0];

    // Fetch all future shifts
    const { data: shiftsData } = await supabase
      .from('shifts')
      .select(`
        id, title, hospital, location, shift_date, start_time, end_time, base_value,
        sector:sectors(id, name, color)
      `)
      .eq('tenant_id', currentTenantId)
      .gte('shift_date', today)
      .order('shift_date', { ascending: true });

    // Fetch all active assignments to know which shifts are taken
    const { data: assignmentsData } = await supabase
      .from('shift_assignments')
      .select('shift_id, user_id')
      .eq('tenant_id', currentTenantId)
      .in('status', ['assigned', 'confirmed', 'completed']);

    // Get my assigned shifts
    const myAssigned = new Set(
      assignmentsData?.filter(a => a.user_id === user.id).map(a => a.shift_id) || []
    );
    setMyAssignedShiftIds(myAssigned);

    // Get all assigned shift IDs
    const assignedShiftIds = new Set(assignmentsData?.map(a => a.shift_id) || []);

    // Filter to only available shifts (not assigned)
    const available = (shiftsData || [])
      .filter(s => !assignedShiftIds.has(s.id))
      .map(s => ({
        ...s,
        sector: s.sector as AvailableShift['sector'],
      }));

    setAvailableShifts(available);

    // Fetch my offers
    const { data: offersData } = await supabase
      .from('shift_offers')
      .select(`
        id, status, message, created_at, reviewed_at,
        shift:shifts(id, title, hospital, shift_date, start_time, end_time, base_value, sector:sectors(name, color))
      `)
      .eq('tenant_id', currentTenantId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (offersData) {
      setMyOffers(offersData as unknown as MyOffer[]);
    }

    setLoading(false);
  }

  async function submitOffer() {
    if (!user || !currentTenantId || !selectedShift) return;
    
    setSubmitting(true);

    const { error } = await supabase
      .from('shift_offers')
      .insert({
        tenant_id: currentTenantId,
        shift_id: selectedShift.id,
        user_id: user.id,
        message: offerMessage.trim() || null,
        status: 'pending',
        created_by: user.id,
      });

    setSubmitting(false);

    if (error) {
      console.error('Error submitting offer:', error);
      toast({
        title: 'Erro ao enviar candidatura',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Candidatura enviada!',
        description: 'Aguarde a aprovação do administrador.',
      });
      setSelectedShift(null);
      setOfferMessage('');
      fetchData();
    }
  }

  async function cancelOffer(offerId: string) {
    const { error } = await supabase
      .from('shift_offers')
      .delete()
      .eq('id', offerId);

    if (error) {
      toast({
        title: 'Erro ao cancelar',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Candidatura cancelada' });
      fetchData();
    }
  }

  // Check if user already has a pending offer for a shift
  function hasPendingOffer(shiftId: string): boolean {
    return myOffers.some(o => o.shift?.id === shiftId && o.status === 'pending');
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500',
    approved: 'bg-green-500/10 text-green-600 border-green-500',
    rejected: 'bg-red-500/10 text-red-600 border-red-500',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Aguardando',
    approved: 'Aprovado',
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
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Hand className="h-5 w-5 text-primary" />
          Plantões Disponíveis
        </h1>
        <p className="text-sm text-muted-foreground">Candidate-se para plantões vagos</p>
      </div>

      <Tabs defaultValue="available" className="space-y-4">
        <TabsList className="w-full">
          <TabsTrigger value="available" className="flex-1">
            Disponíveis ({availableShifts.length})
          </TabsTrigger>
          <TabsTrigger value="myoffers" className="flex-1">
            Minhas Candidaturas ({myOffers.length})
          </TabsTrigger>
        </TabsList>

        {/* Available Shifts */}
        <TabsContent value="available" className="space-y-3">
          {availableShifts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                <p className="text-muted-foreground">Todos os plantões estão cobertos!</p>
                <p className="text-sm text-muted-foreground mt-1">Volte mais tarde para ver novas oportunidades.</p>
              </CardContent>
            </Card>
          ) : (
            availableShifts.map(shift => {
              const isPending = hasPendingOffer(shift.id);
              
              return (
                <Card key={shift.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Sector Badge */}
                        {shift.sector && (
                          <Badge 
                            variant="outline" 
                            className="mb-2"
                            style={{ 
                              borderColor: shift.sector.color,
                              backgroundColor: `${shift.sector.color}10`,
                            }}
                          >
                            <Building className="h-3 w-3 mr-1" />
                            {shift.sector.name}
                          </Badge>
                        )}
                        
                        {/* Title */}
                        <h3 className="font-semibold">{shift.title}</h3>
                        
                        {/* Details */}
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

                      {/* Value and Action */}
                      <div className="text-right shrink-0">
                        {shift.base_value && (
                          <p className="text-lg font-bold text-green-600 flex items-center justify-end gap-1">
                            <DollarSign className="h-4 w-4" />
                            {shift.base_value.toFixed(2)}
                          </p>
                        )}
                        
                        {isPending ? (
                          <Badge variant="outline" className="mt-2 bg-yellow-500/10 text-yellow-600">
                            Candidatura enviada
                          </Badge>
                        ) : (
                          <Button 
                            size="sm" 
                            className="mt-2"
                            onClick={() => setSelectedShift(shift)}
                          >
                            <Hand className="h-4 w-4 mr-2" />
                            Candidatar
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* My Offers */}
        <TabsContent value="myoffers" className="space-y-3">
          {myOffers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Hand className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Nenhuma candidatura enviada</p>
                <p className="text-sm text-muted-foreground mt-1">Candidate-se a plantões disponíveis!</p>
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
                        {offer.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
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
                          </div>
                          {offer.message && (
                            <p className="mt-2 text-sm italic text-muted-foreground">
                              "{offer.message}"
                            </p>
                          )}
                        </>
                      )}
                      
                      <p className="text-xs text-muted-foreground mt-2">
                        Enviada em {format(parseISO(offer.created_at), "dd/MM 'às' HH:mm")}
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
            <DialogTitle>Candidatar-se ao Plantão</DialogTitle>
            <DialogDescription>
              Envie sua candidatura para este plantão
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
                  placeholder="Deixe uma mensagem para o administrador..."
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
            <Button onClick={submitOffer} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Hand className="h-4 w-4 mr-2" />
                  Enviar Candidatura
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
