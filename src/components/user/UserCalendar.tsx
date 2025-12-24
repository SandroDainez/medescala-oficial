import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Users, Calendar, Clock, MapPin, Hand, Check } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Sector {
  id: string;
  name: string;
  color: string;
}

interface Shift {
  id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  sector_id: string | null;
  sector?: Sector;
}

interface ShiftAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_value: number;
  status: string;
  profile: { name: string | null } | null;
}

interface MySector {
  sector_id: string;
  sector: Sector;
}

interface ShiftOffer {
  id: string;
  shift_id: string;
  user_id: string;
  status: string;
}

export default function UserCalendar() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [mySectors, setMySectors] = useState<MySector[]>([]);
  const [allSectors, setAllSectors] = useState<Sector[]>([]);
  const [myOffers, setMyOffers] = useState<ShiftOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [filterSector, setFilterSector] = useState<string>('all');
  
  // Offer dialog
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [selectedShiftForOffer, setSelectedShiftForOffer] = useState<Shift | null>(null);
  const [offerMessage, setOfferMessage] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);

  useEffect(() => {
    if (currentTenantId && user) {
      fetchData();
    }
  }, [currentTenantId, user, currentDate]);

  async function fetchData() {
    if (!currentTenantId || !user) return;
    setLoading(true);

    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);

    // Fetch my sectors, all sectors, shifts, and my offers
    const [mySectorsRes, allSectorsRes, shiftsRes, myOffersRes] = await Promise.all([
      supabase
        .from('sector_memberships')
        .select('sector_id, sector:sectors(*)')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id),
      supabase
        .from('sectors')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .eq('active', true),
      supabase
        .from('shifts')
        .select('*, sector:sectors(*)')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', format(start, 'yyyy-MM-dd'))
        .lte('shift_date', format(end, 'yyyy-MM-dd'))
        .order('shift_date', { ascending: true }),
      supabase
        .from('shift_offers')
        .select('id, shift_id, user_id, status')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id),
    ]);

    if (mySectorsRes.data) {
      setMySectors(mySectorsRes.data as unknown as MySector[]);
    }

    if (allSectorsRes.data) {
      setAllSectors(allSectorsRes.data);
    }

    if (myOffersRes.data) {
      setMyOffers(myOffersRes.data);
    }

    if (shiftsRes.data) {
      setShifts(shiftsRes.data as unknown as Shift[]);

      // Fetch assignments for all shifts
      if (shiftsRes.data.length > 0) {
        const shiftIds = shiftsRes.data.map(s => s.id);
        const { data: assignmentsData } = await supabase
          .from('shift_assignments')
          .select('id, shift_id, user_id, assigned_value, status, profile:profiles!shift_assignments_user_id_profiles_fkey(name)')
          .in('shift_id', shiftIds);

        if (assignmentsData) {
          setAssignments(assignmentsData as unknown as ShiftAssignment[]);
        }
      }
    }

    setLoading(false);
  }

  // Check if shift is available (marked as [DISPONÍVEL] in notes)
  function isAvailableShift(shift: Shift) {
    return shift.notes?.includes('[DISPONÍVEL]');
  }

  // Check if I already offered for this shift
  function hasOfferedForShift(shiftId: string) {
    return myOffers.some(o => o.shift_id === shiftId);
  }

  // Get my offer status for a shift
  function getMyOfferStatus(shiftId: string) {
    const offer = myOffers.find(o => o.shift_id === shiftId);
    return offer?.status;
  }

  // Filter shifts by sector
  const mySectorIds = mySectors.map(ms => ms.sector_id);
  const filteredShifts = shifts.filter(s => {
    if (filterSector === 'all') {
      // Show all shifts from my sectors OR shifts where I'm assigned
      const isMyAssignment = assignments.some(a => a.shift_id === s.id && a.user_id === user?.id);
      const isInMySector = s.sector_id && mySectorIds.includes(s.sector_id);
      return isMyAssignment || isInMySector || mySectorIds.length === 0; // Show all if no sector assigned
    }
    return s.sector_id === filterSector;
  });

  // Get shifts for a specific date
  function getShiftsForDate(date: Date) {
    return filteredShifts.filter(s => isSameDay(parseISO(s.shift_date), date));
  }

  // Get assignments for a shift
  function getAssignmentsForShift(shiftId: string) {
    return assignments.filter(a => a.shift_id === shiftId);
  }

  // Check if I'm assigned to a shift
  function isMyShift(shiftId: string) {
    return assignments.some(a => a.shift_id === shiftId && a.user_id === user?.id);
  }

  // Calendar navigation
  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  const firstDayOfWeek = startOfMonth(currentDate).getDay();
  const emptyCells = Array(firstDayOfWeek).fill(null);

  function openDayView(date: Date) {
    setSelectedDate(date);
    setDayDialogOpen(true);
  }

  function openOfferDialog(shift: Shift) {
    setSelectedShiftForOffer(shift);
    setOfferMessage('');
    setOfferDialogOpen(true);
  }

  async function submitOffer() {
    if (!selectedShiftForOffer || !currentTenantId || !user) return;
    
    setSubmittingOffer(true);
    
    const { error } = await supabase.from('shift_offers').insert({
      tenant_id: currentTenantId,
      shift_id: selectedShiftForOffer.id,
      user_id: user.id,
      message: offerMessage || null,
      created_by: user.id,
    });

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Aviso', description: 'Você já se ofereceu para este plantão', variant: 'destructive' });
      } else {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Oferta enviada!', description: 'O administrador irá analisar sua oferta.' });
      fetchData();
      setOfferDialogOpen(false);
    }
    
    setSubmittingOffer(false);
  }

  // Get sectors to show in filter (only my sectors or all if no assignment)
  const sectorsForFilter = mySectors.length > 0 
    ? mySectors.map(ms => ms.sector) 
    : allSectors;

  if (loading) {
    return <div className="text-muted-foreground p-4">Carregando calendário...</div>;
  }

  return (
    <div className="space-y-4">
      {/* My Sectors Badge */}
      {mySectors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">Meus Setores:</span>
          {mySectors.map(ms => (
            <Badge
              key={ms.sector_id}
              style={{ backgroundColor: ms.sector.color, color: 'white' }}
            >
              {ms.sector.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Header with navigation and filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold min-w-[200px] text-center">
            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={filterSector} onValueChange={setFilterSector}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meus setores</SelectItem>
              {sectorsForFilter.map(sector => (
                <SelectItem key={sector.id} value={sector.id}>{sector.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {emptyCells.map((_, index) => (
              <div key={`empty-${index}`} className="min-h-[80px] sm:min-h-[100px]" />
            ))}

            {days.map(day => {
              const dayShifts = getShiftsForDate(day);
              const hasShifts = dayShifts.length > 0;
              const hasMyShift = dayShifts.some(s => isMyShift(s.id));
              const hasAvailableShift = dayShifts.some(s => isAvailableShift(s) && !isMyShift(s.id));

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[80px] sm:min-h-[100px] p-1 border rounded-lg cursor-pointer transition-colors
                    ${isToday(day) ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'}
                    ${hasMyShift ? 'ring-2 ring-primary ring-inset' : ''}
                    ${hasAvailableShift ? 'ring-2 ring-green-500 ring-inset' : ''}
                  `}
                  onClick={() => openDayView(day)}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                    {format(day, 'd')}
                  </div>

                  {hasShifts && (
                    <div className="space-y-1">
                      {dayShifts.slice(0, 2).map(shift => {
                        const shiftAssignments = getAssignmentsForShift(shift.id);
                        const isMine = isMyShift(shift.id);
                        const isAvailable = isAvailableShift(shift);
                        const sectorColor = shift.sector?.color || '#22c55e';

                        return (
                          <div
                            key={shift.id}
                            className={`text-xs p-1 rounded truncate ${isMine ? 'font-bold' : ''}`}
                            style={{
                              backgroundColor: isAvailable ? '#dcfce7' : `${sectorColor}20`,
                              borderLeft: `3px solid ${isAvailable ? '#22c55e' : sectorColor}`,
                            }}
                            title={`${shift.title} - ${shift.hospital}`}
                          >
                            <div className="truncate">{shift.sector?.name || shift.hospital}</div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              {isAvailable ? (
                                <Badge className="text-[10px] px-1 h-4 bg-green-500">DISPONÍVEL</Badge>
                              ) : (
                                <>
                                  <Users className="h-3 w-3" />
                                  <span>{shiftAssignments.length}</span>
                                </>
                              )}
                              {isMine && <Badge className="text-[10px] px-1 h-4 bg-primary">EU</Badge>}
                            </div>
                          </div>
                        );
                      })}
                      {dayShifts.length > 2 && (
                        <div className="text-xs text-muted-foreground">
                          +{dayShifts.length - 2} mais
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded ring-2 ring-primary" />
          <span>Dia com meu plantão</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded ring-2 ring-green-500" />
          <span>Plantão disponível</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="text-[10px] px-1 h-4 bg-primary">EU</Badge>
          <span>Estou escalado</span>
        </div>
      </div>

      {/* Day Detail Dialog */}
      <Dialog open={dayDialogOpen} onOpenChange={setDayDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {selectedDate && getShiftsForDate(selectedDate).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum plantão neste dia
              </p>
            ) : (
              selectedDate && getShiftsForDate(selectedDate).map(shift => {
                const shiftAssignments = getAssignmentsForShift(shift.id);
                const isMine = isMyShift(shift.id);
                const isAvailable = isAvailableShift(shift);
                const hasOffered = hasOfferedForShift(shift.id);
                const offerStatus = getMyOfferStatus(shift.id);
                const sectorColor = shift.sector?.color || '#22c55e';

                return (
                  <Card 
                    key={shift.id} 
                    className={`${isMine ? 'ring-2 ring-primary' : ''} ${isAvailable ? 'ring-2 ring-green-500' : ''}`}
                    style={{ borderLeft: `4px solid ${isAvailable ? '#22c55e' : sectorColor}` }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-lg">{shift.title}</CardTitle>
                            {isMine && <Badge className="bg-primary">Meu Plantão</Badge>}
                            {isAvailable && !isMine && (
                              <Badge className="bg-green-500">Plantão Disponível</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            {shift.sector && (
                              <span 
                                className="px-2 py-0.5 rounded text-white text-xs"
                                style={{ backgroundColor: sectorColor }}
                              >
                                {shift.sector.name}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {shift.hospital}
                            </span>
                            {shift.location && <span>• {shift.location}</span>}
                          </div>
                          <div className="flex items-center gap-1 text-sm mt-1">
                            <Clock className="h-3 w-3" />
                            {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {/* Show colleagues if not available shift */}
                        {!isAvailable && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Users className="h-4 w-4" />
                              Colegas de Plantão ({shiftAssignments.length}):
                            </div>
                            {shiftAssignments.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhum plantonista atribuído</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {shiftAssignments.map(assignment => (
                                  <Badge 
                                    key={assignment.id} 
                                    variant={assignment.user_id === user?.id ? 'default' : 'secondary'}
                                  >
                                    {assignment.profile?.name || 'Sem nome'}
                                    {assignment.user_id === user?.id && ' (Eu)'}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Offer button for available shifts */}
                        {isAvailable && !isMine && (
                          <div className="pt-2 border-t">
                            {hasOffered ? (
                              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                                <Check className="h-5 w-5 text-green-600" />
                                <div>
                                  <p className="font-medium text-sm">Você já se ofereceu para este plantão</p>
                                  <p className="text-xs text-muted-foreground">
                                    Status: {offerStatus === 'pending' ? 'Aguardando análise' : 
                                             offerStatus === 'accepted' ? 'Aceito' : 'Rejeitado'}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <Button 
                                className="w-full bg-green-600 hover:bg-green-700"
                                onClick={() => openOfferDialog(shift)}
                              >
                                <Hand className="mr-2 h-4 w-4" />
                                Me Oferecer para Este Plantão
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Offer Dialog */}
      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hand className="h-5 w-5 text-green-600" />
              Oferecer-se para Plantão
            </DialogTitle>
          </DialogHeader>
          
          {selectedShiftForOffer && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <p className="font-medium">{selectedShiftForOffer.title}</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(parseISO(selectedShiftForOffer.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </p>
                  <p className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {selectedShiftForOffer.start_time.slice(0, 5)} - {selectedShiftForOffer.end_time.slice(0, 5)}
                  </p>
                  <p className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {selectedShiftForOffer.hospital}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Mensagem para o administrador (opcional):</label>
                <Textarea 
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder="Ex: Tenho disponibilidade total neste dia..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700" 
                  onClick={submitOffer}
                  disabled={submittingOffer}
                >
                  <Hand className="mr-2 h-4 w-4" />
                  {submittingOffer ? 'Enviando...' : 'Confirmar Oferta'}
                </Button>
                <Button variant="outline" onClick={() => setOfferDialogOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
