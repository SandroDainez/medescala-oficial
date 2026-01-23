import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { parseDateOnly } from '@/lib/utils';
import { 
  Clock, 
  LogIn, 
  LogOut, 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  Calendar,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Assignment {
  id: string;
  assigned_value: number;
  checkin_at: string | null;
  checkout_at: string | null;
  status: string;
  shift: {
    title: string;
    hospital: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    sector_id: string | null;
  };
}

interface Sector {
  id: string;
  name: string;
  color: string | null;
  checkin_enabled: boolean;
  require_gps_checkin: boolean;
  allowed_checkin_radius_meters: number | null;
  checkin_tolerance_minutes: number;
  reference_latitude: number | null;
  reference_longitude: number | null;
}

export default function UserShifts() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSectors, setOpenSectors] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showGpsErrorDialog, setShowGpsErrorDialog] = useState(false);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [didAutoSelect, setDidAutoSelect] = useState(false);

  useEffect(() => {
    if (user && currentTenantId) {
      setDidAutoSelect(false);
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentTenantId]);

  async function fetchData() {
    if (!currentTenantId || !user) return;

    setLoading(true);

    const [assignmentsRes, sectorsRes] = await Promise.all([
      supabase
        .from('shift_assignments')
        .select(
          'id, assigned_value, checkin_at, checkout_at, status, shift:shifts(title, hospital, shift_date, start_time, end_time, sector_id)'
        )
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('sectors')
        .select('id, name, color, checkin_enabled, require_gps_checkin, allowed_checkin_radius_meters, checkin_tolerance_minutes, reference_latitude, reference_longitude')
        .eq('tenant_id', currentTenantId)
        .eq('active', true),
    ]);

    if (assignmentsRes.error) {
      console.error('[UserShifts] Error fetching assignments:', assignmentsRes.error);
      toast({ title: 'Erro ao carregar agenda', description: assignmentsRes.error.message, variant: 'destructive' });
    }

    if (sectorsRes.error) {
      console.error('[UserShifts] Error fetching sectors:', sectorsRes.error);
    }

    if (assignmentsRes.data) {
      setAssignments((assignmentsRes.data as unknown as Assignment[]).filter((a) => !!a.shift));
    } else {
      setAssignments([]);
    }

    if (sectorsRes.data) {
      setSectors(sectorsRes.data);
      setOpenSectors(new Set(sectorsRes.data.map((s) => s.id)));
    } else {
      setSectors([]);
    }

    setLoading(false);
  }

  async function getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada pelo seu navegador'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              reject(new Error('Permissão de localização negada. Por favor, habilite nas configurações do seu navegador.'));
              break;
            case error.POSITION_UNAVAILABLE:
              reject(new Error('Localização indisponível. Verifique se o GPS está ativado.'));
              break;
            case error.TIMEOUT:
              reject(new Error('Tempo esgotado ao obter localização. Tente novamente.'));
              break;
            default:
              reject(new Error('Erro ao obter localização'));
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  }

  // Calculate distance in meters between two GPS coordinates (Haversine formula)
  function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async function handleCheckin(assignment: Assignment) {
    if (!user || !currentTenantId) return;
    
    const sector = sectors.find(s => s.id === assignment.shift.sector_id);
    const requiresGps = sector?.require_gps_checkin ?? false;
    
    setProcessingId(assignment.id);
    setGpsError(null);

    let latitude: number | null = null;
    let longitude: number | null = null;

    // Try to get GPS if sector requires it or just to improve tracking
    try {
      const position = await getCurrentPosition();
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (error) {
      if (requiresGps) {
        setGpsError((error as Error).message);
        setShowGpsErrorDialog(true);
        setProcessingId(null);
        return;
      }
      // If GPS is not required, continue without it
      console.log('GPS not available, continuing without location');
    }

    // Validate distance from reference location if GPS is required
    if (requiresGps && latitude !== null && longitude !== null) {
      const refLat = sector?.reference_latitude;
      const refLon = sector?.reference_longitude;
      const allowedRadius = sector?.allowed_checkin_radius_meters ?? 500;

      if (refLat && refLon) {
        const distance = calculateDistance(latitude, longitude, refLat, refLon);
        if (distance > allowedRadius) {
          setGpsError(`Você está a ${Math.round(distance)}m do local de trabalho. Máximo permitido: ${allowedRadius}m.`);
          setShowGpsErrorDialog(true);
          setProcessingId(null);
          return;
        }
      }
    }

    // Update check-in
    const { error: updateError } = await supabase
      .from('shift_assignments')
      .update({ 
        checkin_at: new Date().toISOString(), 
        status: 'confirmed', 
        updated_by: user.id 
      })
      .eq('id', assignment.id);

    if (updateError) {
      toast({ title: 'Erro', description: updateError.message, variant: 'destructive' });
      setProcessingId(null);
      return;
    }

    // Save GPS location if available
    if (latitude !== null && longitude !== null) {
      const { error: locationError } = await supabase
        .from('shift_assignment_locations')
        .upsert({
          assignment_id: assignment.id,
          tenant_id: currentTenantId,
          user_id: user.id,
          checkin_latitude: latitude,
          checkin_longitude: longitude,
        });

      if (locationError) {
        console.error('Error saving location:', locationError);
      }
    }

    toast({ 
      title: 'Check-in realizado!',
      description: latitude ? 'Localização registrada com sucesso.' : undefined
    });
    setProcessingId(null);
    fetchData();
  }

  async function handleCheckout(assignment: Assignment) {
    if (!user || !currentTenantId) return;
    
    const sector = sectors.find(s => s.id === assignment.shift.sector_id);
    const requiresGps = sector?.require_gps_checkin ?? false;
    
    setProcessingId(assignment.id);
    setGpsError(null);

    let latitude: number | null = null;
    let longitude: number | null = null;

    // Try to get GPS
    try {
      const position = await getCurrentPosition();
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (error) {
      if (requiresGps) {
        setGpsError((error as Error).message);
        setShowGpsErrorDialog(true);
        setProcessingId(null);
        return;
      }
    }

    // Validate distance from reference location if GPS is required
    if (requiresGps && latitude !== null && longitude !== null) {
      const refLat = sector?.reference_latitude;
      const refLon = sector?.reference_longitude;
      const allowedRadius = sector?.allowed_checkin_radius_meters ?? 500;

      if (refLat && refLon) {
        const distance = calculateDistance(latitude, longitude, refLat, refLon);
        if (distance > allowedRadius) {
          setGpsError(`Você está a ${Math.round(distance)}m do local de trabalho. Máximo permitido: ${allowedRadius}m.`);
          setShowGpsErrorDialog(true);
          setProcessingId(null);
          return;
        }
      }
    }

    // Update check-out
    const { error: updateError } = await supabase
      .from('shift_assignments')
      .update({ 
        checkout_at: new Date().toISOString(), 
        status: 'completed', 
        updated_by: user.id 
      })
      .eq('id', assignment.id);

    if (updateError) {
      toast({ title: 'Erro', description: updateError.message, variant: 'destructive' });
      setProcessingId(null);
      return;
    }

    // Update GPS location with checkout coordinates
    if (latitude !== null && longitude !== null) {
      const { error: locationError } = await supabase
        .from('shift_assignment_locations')
        .upsert({
          assignment_id: assignment.id,
          tenant_id: currentTenantId,
          user_id: user.id,
          checkout_latitude: latitude,
          checkout_longitude: longitude,
        });

      if (locationError) {
        console.error('Error saving checkout location:', locationError);
      }
    }

    toast({ 
      title: 'Check-out realizado!',
      description: latitude ? 'Localização registrada com sucesso.' : undefined
    });
    setProcessingId(null);
    fetchData();
  }

  const toggleSector = (sectorId: string) => {
    setOpenSectors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectorId)) {
        newSet.delete(sectorId);
      } else {
        newSet.add(sectorId);
      }
      return newSet;
    });
  };

  const statusColors: Record<string, string> = {
    assigned: 'bg-blue-500/10 text-blue-600 border-blue-200',
    confirmed: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
    completed: 'bg-green-500/10 text-green-600 border-green-200',
    cancelled: 'bg-red-500/10 text-red-600 border-red-200',
  };

  const statusLabels: Record<string, string> = {
    assigned: 'Atribuído',
    confirmed: 'Em andamento',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  };

  const monthOptions = useMemo(
    () => [
      { value: 0, label: 'Janeiro' },
      { value: 1, label: 'Fevereiro' },
      { value: 2, label: 'Março' },
      { value: 3, label: 'Abril' },
      { value: 4, label: 'Maio' },
      { value: 5, label: 'Junho' },
      { value: 6, label: 'Julho' },
      { value: 7, label: 'Agosto' },
      { value: 8, label: 'Setembro' },
      { value: 9, label: 'Outubro' },
      { value: 10, label: 'Novembro' },
      { value: 11, label: 'Dezembro' },
    ],
    []
  );

  const yearOptions = useMemo(() => {
    const baseYear = new Date().getFullYear();
    const assignmentYears = assignments.map((a) => Number(a.shift.shift_date.slice(0, 4)));
    const allYears = new Set([baseYear - 1, baseYear, baseYear + 1, baseYear + 2, ...assignmentYears]);
    return Array.from(allYears).sort((a, b) => a - b);
  }, [assignments]);

  useEffect(() => {
    if (didAutoSelect || assignments.length === 0) return;

    const sortedDates = assignments
      .map((a) => parseDateOnly(a.shift.shift_date))
      .sort((a, b) => a.getTime() - b.getTime());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureShift = sortedDates.find((d) => d >= today) || sortedDates[sortedDates.length - 1];

    if (futureShift) {
      setSelectedMonth(futureShift.getMonth());
      setSelectedYear(futureShift.getFullYear());
      setDidAutoSelect(true);
    }
  }, [assignments, didAutoSelect]);

  const effectiveMonth = selectedMonth ?? now.getMonth();
  const effectiveYear = selectedYear ?? now.getFullYear();

  // Today's shifts that need check-in
  const todayShifts = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return assignments.filter(a => 
      a.shift.shift_date === today && 
      (a.status === 'assigned' || a.status === 'confirmed')
    );
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const inMonth = assignments.filter((a) => {
      const year = Number(a.shift.shift_date.slice(0, 4));
      const month = Number(a.shift.shift_date.slice(5, 7)) - 1;
      return year === effectiveYear && month === effectiveMonth;
    });

    return inMonth.sort((a, b) => {
      const ad = `${a.shift.shift_date}T${a.shift.start_time}`;
      const bd = `${b.shift.shift_date}T${b.shift.start_time}`;
      return ad.localeCompare(bd);
    });
  }, [assignments, effectiveMonth, effectiveYear]);

  const groupedAssignments = filteredAssignments.reduce((acc, assignment) => {
    const sectorId = assignment.shift.sector_id || 'sem-setor';
    if (!acc[sectorId]) {
      acc[sectorId] = [];
    }
    acc[sectorId].push(assignment);
    return acc;
  }, {} as Record<string, Assignment[]>);

  const getSectorInfo = (sectorId: string): Sector & { name: string; color: string } => {
    if (sectorId === 'sem-setor') {
      return { 
        id: 'sem-setor',
        name: 'Sem Setor', 
        color: '#6b7280',
        checkin_enabled: false,
        require_gps_checkin: false,
        allowed_checkin_radius_meters: null,
        checkin_tolerance_minutes: 30,
        reference_latitude: null,
        reference_longitude: null
      };
    }
    const sector = sectors.find((s) => s.id === sectorId);
    return sector || {
      id: sectorId,
      name: 'Desconhecido',
      color: '#6b7280',
      checkin_enabled: false,
      require_gps_checkin: false,
      allowed_checkin_radius_meters: null,
      checkin_tolerance_minutes: 30,
      reference_latitude: null,
      reference_longitude: null
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* GPS Error Dialog */}
      <AlertDialog open={showGpsErrorDialog} onOpenChange={setShowGpsErrorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Localização Necessária
            </AlertDialogTitle>
            <AlertDialogDescription>
              {gpsError || 'Este setor exige validação de localização GPS para o check-in/check-out.'}
              <br /><br />
              Por favor, habilite a localização no seu dispositivo e tente novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            <AlertDialogAction onClick={() => setShowGpsErrorDialog(false)}>
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <header>
        <h1 className="text-2xl font-bold text-foreground">Minha Agenda</h1>
        <p className="text-muted-foreground">Escolha o mês e veja seus plantões</p>
      </header>

      {/* Today's Shifts - Quick Check-in Section */}
      {todayShifts.length > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Plantões de Hoje
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayShifts.map((a) => {
              const sectorInfo = getSectorInfo(a.shift.sector_id || 'sem-setor');
              const isProcessing = processingId === a.id;
              const needsCheckin = a.status === 'assigned' && !a.checkin_at;
              const needsCheckout = a.checkin_at && !a.checkout_at;

              return (
                <div 
                  key={a.id} 
                  className="p-4 rounded-xl bg-card border-2 border-primary/20 shadow-sm"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-foreground">{a.shift.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: sectorInfo.color }} 
                          />
                          <span>{sectorInfo.name}</span>
                        </div>
                      </div>
                      <Badge className={statusColors[a.status]} variant="outline">
                        {statusLabels[a.status]}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {a.shift.start_time.slice(0, 5)} - {a.shift.end_time.slice(0, 5)}
                      </div>
                      {sectorInfo.require_gps_checkin && (
                        <div className="flex items-center gap-1 text-blue-600">
                          <MapPin className="h-4 w-4" />
                          GPS obrigatório
                        </div>
                      )}
                    </div>

                    {a.checkin_at && (
                      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/30 px-3 py-1.5 rounded-lg">
                        <CheckCircle2 className="h-4 w-4" />
                        Check-in: {format(new Date(a.checkin_at), 'HH:mm')}
                        {a.checkout_at && (
                          <span className="ml-2">| Check-out: {format(new Date(a.checkout_at), 'HH:mm')}</span>
                        )}
                      </div>
                    )}

                    {/* Large Check-in/Check-out buttons for mobile */}
                    <div className="flex gap-2">
                      {needsCheckin && (
                        <Button 
                          size="lg" 
                          className="flex-1 h-14 text-lg font-semibold"
                          onClick={() => handleCheckin(a)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                              Aguarde...
                            </>
                          ) : (
                            <>
                              <LogIn className="mr-2 h-5 w-5" />
                              Fazer Check-in
                            </>
                          )}
                        </Button>
                      )}
                      {needsCheckout && (
                        <Button 
                          size="lg" 
                          variant="secondary"
                          className="flex-1 h-14 text-lg font-semibold"
                          onClick={() => handleCheckout(a)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                              Aguarde...
                            </>
                          ) : (
                            <>
                              <LogOut className="mr-2 h-5 w-5" />
                              Fazer Check-out
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <section aria-label="Filtro de mês" className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">Mês</div>
          <Select value={String(effectiveMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o mês" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">Ano</div>
          <Select value={String(effectiveYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o ano" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {filteredAssignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nenhum plantão neste mês</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedAssignments).map(([sectorId, sectorAssignments]) => {
            const sectorInfo = getSectorInfo(sectorId);
            const isOpen = openSectors.has(sectorId);

            return (
              <Collapsible key={sectorId} open={isOpen} onOpenChange={() => toggleSector(sectorId)}>
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: sectorInfo.color }} />
                        <span className="font-semibold text-foreground">{sectorInfo.name}</span>
                        <Badge variant="secondary" className="ml-2">
                          {sectorAssignments.length} plantão{sectorAssignments.length !== 1 ? 'ões' : ''}
                        </Badge>
                        {sectorInfo.require_gps_checkin && (
                          <MapPin className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4">
                      <div className="space-y-3">
                        {sectorAssignments.map((a) => {
                          const shiftDate = parseDateOnly(a.shift.shift_date);
                          const isShiftToday = isToday(shiftDate);
                          const isShiftTomorrow = isTomorrow(shiftDate);
                          const isShiftPast = isPast(shiftDate) && !isShiftToday;
                          const isProcessing = processingId === a.id;
                          const needsCheckin = a.status === 'assigned' && !a.checkin_at;
                          const needsCheckout = a.checkin_at && !a.checkout_at;

                          return (
                            <div 
                              key={a.id} 
                              className={`p-4 rounded-lg border bg-card transition-colors ${
                                isShiftToday ? 'border-primary/50 bg-primary/5' : 
                                isShiftTomorrow ? 'border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/20' :
                                'hover:bg-muted/30'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-medium text-foreground">{a.shift.title}</h4>
                                    <Badge className={statusColors[a.status]} variant="outline">
                                      {statusLabels[a.status]}
                                    </Badge>
                                    {isShiftToday && (
                                      <Badge variant="default" className="bg-primary">Hoje</Badge>
                                    )}
                                    {isShiftTomorrow && (
                                      <Badge variant="secondary">Amanhã</Badge>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <Calendar className="h-4 w-4" />
                                      {format(shiftDate, 'dd/MM/yyyy', { locale: ptBR })}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-4 w-4" />
                                      {a.shift.start_time.slice(0, 5)} - {a.shift.end_time.slice(0, 5)}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-4 w-4" />
                                      {sectorInfo.name}
                                    </div>
                                  </div>

                                  {a.assigned_value > 0 && (
                                    <p className="text-sm font-medium text-primary">R$ {Number(a.assigned_value).toFixed(2)}</p>
                                  )}

                                  {a.checkin_at && (
                                    <div className="flex items-center gap-1 text-xs text-green-600">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Check-in: {format(new Date(a.checkin_at), 'HH:mm')}
                                      {a.checkout_at && ` | Check-out: ${format(new Date(a.checkout_at), 'HH:mm')}`}
                                    </div>
                                  )}
                                </div>

                                {/* Check-in/Check-out buttons - show when sector has checkin enabled */}
                                {sectorInfo.checkin_enabled && (
                                  <div className="flex gap-2 flex-shrink-0">
                                    {needsCheckin && !isShiftPast && (
                                      <Button 
                                        size="sm" 
                                        onClick={() => handleCheckin(a)}
                                        disabled={isProcessing}
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <LogIn className="mr-2 h-4 w-4" />
                                        )}
                                        Check-in
                                      </Button>
                                    )}
                                    {needsCheckout && (
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        onClick={() => handleCheckout(a)}
                                        disabled={isProcessing}
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <LogOut className="mr-2 h-4 w-4" />
                                        )}
                                        Check-out
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
