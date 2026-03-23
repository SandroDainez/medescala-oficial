import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { extractErrorMessage } from '@/lib/errorMessage';
import { parseDateOnly } from '@/lib/utils';
import { MyShiftStatsChart } from '@/components/user/MyShiftStatsChart';
import { mapScheduleToFinancialEntries } from '@/lib/financial/mapScheduleToEntries';
import type { ScheduleAssignment, ScheduleShift, SectorLookup } from '@/lib/financial/types';
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
  AlertCircle,
  ArrowRightLeft,
} from 'lucide-react';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
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
  shift_id?: string;
  user_id: string;
  profile?: {
    id: string;
    name: string | null;
    full_name: string | null;
  } | null;
  assigned_value: number | null;
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

function assignmentNeedsCheckin(assignment: Assignment): boolean {
  return !assignment.checkin_at && assignment.status !== 'completed' && assignment.status !== 'cancelled';
}

function assignmentNeedsCheckout(assignment: Assignment): boolean {
  return !assignment.checkout_at && (Boolean(assignment.checkin_at) || assignment.status === 'confirmed');
}

function getCheckActionCopy(needsCheckin: boolean, needsCheckout: boolean, requiresGps: boolean) {
  if (needsCheckout) {
    return {
      title: 'Check-out pendente',
      description: requiresGps
        ? 'Finalize este plantão com check-out e validação de GPS.'
        : 'Finalize este plantão com o check-out no aplicativo.',
      tone: 'amber' as const,
    };
  }

  if (needsCheckin) {
    return {
      title: 'Check-in pendente',
      description: requiresGps
        ? 'Este plantão exige check-in com validação de GPS.'
        : 'Faça o check-in no aplicativo para registrar sua entrada.',
      tone: 'blue' as const,
    };
  }

  return null;
}

function getCheckButtonLabel(kind: 'checkin' | 'checkout', requiresGps: boolean) {
  if (kind === 'checkin') {
    return requiresGps ? 'Check-in com GPS' : 'Fazer Check-in';
  }

  return requiresGps ? 'Check-out com GPS' : 'Fazer Check-out';
}

export default function UserShifts() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedAssignmentId = searchParams.get('assignment');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSectors, setOpenSectors] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showGpsErrorDialog, setShowGpsErrorDialog] = useState(false);
  const [displayValueByAssignmentId, setDisplayValueByAssignmentId] = useState<Record<string, number | null>>({});
  const [isPlantonista, setIsPlantonista] = useState<boolean | null>(null);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [didAutoSelect, setDidAutoSelect] = useState(false);

  const effectiveMonth = selectedMonth ?? now.getMonth();
  const effectiveYear = selectedYear ?? now.getFullYear();

  useEffect(() => {
    if (user && currentTenantId) {
      setDidAutoSelect(false);
      checkProfileAndLoad();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentTenantId]);

  async function checkProfileAndLoad() {
    if (!user?.id) return;
    const [{ data: membership }, { data: profile }] = await Promise.all([
      supabase
        .from('memberships')
        .select('active')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('profile_type')
        .eq('id', user.id)
        .maybeSingle(),
    ]);
    const ok = Boolean(membership?.active) && profile?.profile_type === 'plantonista';
    setIsPlantonista(ok);
    if (!ok) {
      setAssignments([]);
      setDisplayValueByAssignmentId({});
      setLoading(false);
      return;
    }
    fetchData();
  }

  async function fetchData() {
    if (!currentTenantId || !user) return;

    setLoading(true);

    const [assignmentsRes, sectorsRes, userValuesRes] = await Promise.all([
      supabase
        .from('shift_assignments')
        .select(
          'id, shift_id, user_id, assigned_value, checkin_at, checkout_at, status, profile:profiles!shift_assignments_user_id_profiles_fkey(id, name, full_name), shift:shifts(title, hospital, shift_date, start_time, end_time, sector_id, base_value)'
        )
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .in('status', ['assigned', 'confirmed', 'completed', 'cancelled'])
        .order('created_at', { ascending: false }),
      supabase
        .from('sectors')
        .select('id, name, color, default_day_value, default_night_value, checkin_enabled, require_gps_checkin, allowed_checkin_radius_meters, checkin_tolerance_minutes, reference_latitude, reference_longitude')
        .eq('tenant_id', currentTenantId)
        // Importante: não filtrar por "active" aqui.
        // Se um setor foi desativado depois do plantão ser criado,
        // ainda precisamos carregar suas configurações para:
        // - exibir corretamente o status
        // - permitir check-out quando houver check-in pendente
        // (evita o cenário de "aparece em alguns plantões e outros não").
        ,
      supabase
        .from('user_sector_values')
        .select('sector_id, user_id, day_value, night_value, month, year, updated_at')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id),
    ]);

    if (assignmentsRes.error) {
      console.error('[UserShifts] Error fetching assignments:', assignmentsRes.error);
      toast({ title: 'Erro ao carregar agenda', description: extractErrorMessage(assignmentsRes.error, 'Não foi possível carregar sua agenda.'), variant: 'destructive' });
    }

    if (sectorsRes.error) {
      console.error('[UserShifts] Error fetching sectors:', sectorsRes.error);
    }

    if (assignmentsRes.data) {
      const allAssignments = assignmentsRes.data as unknown as Assignment[];
      const validAssignments = allAssignments.filter((a) => !!a.shift);
      setAssignments(validAssignments);

      const scheduleShifts: ScheduleShift[] = validAssignments.map((a) => ({
        id: a.shift_id || '',
        shift_date: a.shift.shift_date,
        start_time: a.shift.start_time,
        end_time: a.shift.end_time,
        sector_id: a.shift.sector_id ?? null,
        base_value: (a.shift as any).base_value !== null && (a.shift as any).base_value !== undefined
          ? Number((a.shift as any).base_value)
          : null,
        title: a.shift.title,
        hospital: a.shift.hospital,
      }));

      const scheduleAssignments: ScheduleAssignment[] = validAssignments.map((a) => ({
        id: a.id,
        shift_id: a.shift_id || '',
        user_id: user.id,
        assigned_value: a.assigned_value !== null ? Number(a.assigned_value) : null,
        profile_name: 'Você',
      }));

      const sectorsLookup: SectorLookup[] = (sectorsRes.data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        default_day_value: s.default_day_value ?? null,
        default_night_value: s.default_night_value ?? null,
      }));

      const entries = mapScheduleToFinancialEntries({
        shifts: scheduleShifts,
        assignments: scheduleAssignments,
        sectors: sectorsLookup,
        userSectorValues: (userValuesRes.data ?? []) as any[],
      });

      const valuesMap: Record<string, number | null> = {};
      entries.forEach((entry) => {
        valuesMap[entry.id] = entry.value_source === 'invalid' ? null : entry.final_value;
      });
      setDisplayValueByAssignmentId(valuesMap);
    } else {
      setAssignments([]);
      setDisplayValueByAssignmentId({});
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

  async function notifyAdminsAboutLocationFailure(params: {
    assignment: Assignment;
    action: 'checkin' | 'checkout';
    reason: string;
  }) {
    if (!currentTenantId || !user?.id) return;

    try {
      const [{ data: adminsData, error: adminsError }, { data: profileData }] = await Promise.all([
        supabase
          .from('memberships')
          .select('user_id')
          .eq('tenant_id', currentTenantId)
          .in('role', ['admin', 'owner'])
          .eq('active', true),
        supabase
          .from('profiles')
          .select('full_name, name')
          .eq('id', user.id)
          .maybeSingle(),
      ]);

      if (adminsError || !adminsData?.length) return;

      const actorName =
        (profileData as { full_name?: string | null; name?: string | null } | null)?.full_name?.trim() ||
        (profileData as { full_name?: string | null; name?: string | null } | null)?.name?.trim() ||
        user.email ||
        'Usuário';

      const shiftDateLabel = format(parseDateOnly(params.assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR });
      const actionLabel = params.action === 'checkin' ? 'check-in' : 'check-out';
      const notifications = adminsData
        .map((item: { user_id: string }) => item.user_id)
        .filter((adminUserId) => adminUserId && adminUserId !== user.id)
        .map((adminUserId) => ({
          tenant_id: currentTenantId,
          user_id: adminUserId,
          shift_assignment_id: params.assignment.id,
          type: 'gps_permission_denied',
          title: `Falha de ${actionLabel} por localização`,
          message:
            `${actorName} não conseguiu realizar ${actionLabel} no plantão ` +
            `"${params.assignment.shift.title}" de ${shiftDateLabel} ` +
            `(${params.assignment.shift.start_time.slice(0, 5)}-${params.assignment.shift.end_time.slice(0, 5)}). ` +
            `Motivo: ${params.reason}`,
        }));

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
    } catch (error) {
      console.error('[UserShifts] Failed to notify admins about location failure:', error);
    }
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
    if (assignment.user_id !== user.id) return;
    
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
        const reason = (error as Error).message;
        setGpsError(reason);
        setShowGpsErrorDialog(true);
        await notifyAdminsAboutLocationFailure({
          assignment,
          action: 'checkin',
          reason,
        });
        setProcessingId(null);
        return;
      }
      // If GPS is not required, continue without it
    }

    // Validate distance from reference location if GPS is required
    if (requiresGps && latitude !== null && longitude !== null) {
      const refLat = sector?.reference_latitude;
      const refLon = sector?.reference_longitude;
      const allowedRadius = sector?.allowed_checkin_radius_meters ?? 500;

      if (refLat && refLon) {
        const distance = calculateDistance(latitude, longitude, refLat, refLon);
        if (distance > allowedRadius) {
          const reason = `Você está a ${Math.round(distance)}m do local de trabalho. Máximo permitido: ${allowedRadius}m.`;
          setGpsError(reason);
          setShowGpsErrorDialog(true);
          await notifyAdminsAboutLocationFailure({
            assignment,
            action: 'checkin',
            reason,
          });
          setProcessingId(null);
          return;
        }
      }
    }

    // Perform check-in with server-side validation (time window + GPS/radius rules)
    const { error: rpcError } = await (supabase as any).rpc('perform_shift_checkin', {
      _assignment_id: assignment.id,
      _latitude: latitude,
      _longitude: longitude,
    });

    if (rpcError) {
      toast({ title: 'Erro', description: extractErrorMessage(rpcError, 'Não foi possível registrar o check-in.'), variant: 'destructive' });
      setProcessingId(null);
      return;
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
    if (assignment.user_id !== user.id) return;
    
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
        const reason = (error as Error).message;
        setGpsError(reason);
        setShowGpsErrorDialog(true);
        await notifyAdminsAboutLocationFailure({
          assignment,
          action: 'checkout',
          reason,
        });
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
          const reason = `Você está a ${Math.round(distance)}m do local de trabalho. Máximo permitido: ${allowedRadius}m.`;
          setGpsError(reason);
          setShowGpsErrorDialog(true);
          await notifyAdminsAboutLocationFailure({
            assignment,
            action: 'checkout',
            reason,
          });
          setProcessingId(null);
          return;
        }
      }
    }

    // Perform check-out with server-side validation (time window + GPS/radius rules)
    const { error: rpcError } = await (supabase as any).rpc('perform_shift_checkout', {
      _assignment_id: assignment.id,
      _latitude: latitude,
      _longitude: longitude,
    });

    if (rpcError) {
      toast({ title: 'Erro', description: extractErrorMessage(rpcError, 'Não foi possível registrar o check-out.'), variant: 'destructive' });
      setProcessingId(null);
      return;
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
    const allYears = new Set<number>();
    // Range fixo de 10 anos antes e depois
    for (let y = baseYear - 10; y <= baseYear + 10; y++) {
      allYears.add(y);
    }
    // Adiciona anos com dados (caso haja fora do range)
    assignmentYears.forEach(y => allYears.add(y));
    return Array.from(allYears).sort((a, b) => b - a); // Ordem decrescente
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

  useEffect(() => {
    if (!highlightedAssignmentId || assignments.length === 0) return;

    const targetAssignment = assignments.find((item) => item.id === highlightedAssignmentId);
    if (!targetAssignment) return;

    const targetDate = parseDateOnly(targetAssignment.shift.shift_date);
    const targetMonth = targetDate.getMonth();
    const targetYear = targetDate.getFullYear();

    if (selectedMonth !== targetMonth) {
      setSelectedMonth(targetMonth);
    }
    if (selectedYear !== targetYear) {
      setSelectedYear(targetYear);
    }

    const timeoutId = window.setTimeout(() => {
      const element = document.getElementById(`assignment-${highlightedAssignmentId}`);
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
      window.setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
      }, 2200);
    }, 180);

    const cleanupId = window.setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('assignment');
      setSearchParams(nextParams, { replace: true });
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(cleanupId);
    };
  }, [assignments, highlightedAssignmentId, searchParams, selectedMonth, selectedYear, setSearchParams]);

  // Today's shifts that need check-in
  const todayShifts = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return assignments.filter((a) => 
      a.user_id === user?.id &&
      a.shift.shift_date === today && 
      (a.status === 'assigned' || a.status === 'confirmed')
    );
  }, [assignments, user?.id]);

  const todayPendingSummary = useMemo(() => {
    return todayShifts.reduce(
      (acc, assignment) => {
        const sector = sectors.find((item) => item.id === assignment.shift.sector_id);
        if (!sector?.checkin_enabled) return acc;

        if (assignmentNeedsCheckin(assignment)) acc.checkin += 1;
        if (assignmentNeedsCheckout(assignment)) acc.checkout += 1;
        return acc;
      },
      { checkin: 0, checkout: 0 },
    );
  }, [todayShifts, sectors]);

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

  if (isPlantonista === false) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Conta administrativa não possui escala de plantões no aplicativo.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
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
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Minha Agenda</h1>
        <p className="text-sm text-muted-foreground">Escolha o mês e veja seus plantões</p>
      </header>

      {/* My Shift Stats Chart Widget */}
      <section aria-label="Meus plantões por setor">
        <MyShiftStatsChart />
      </section>

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
            {(todayPendingSummary.checkin > 0 || todayPendingSummary.checkout > 0) && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    {todayPendingSummary.checkin > 0 && (
                      <p>
                        {todayPendingSummary.checkin} plantão(ões) aguardando check-in.
                      </p>
                    )}
                    {todayPendingSummary.checkout > 0 && (
                      <p>
                        {todayPendingSummary.checkout} plantão(ões) aguardando check-out.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {todayShifts.map((a) => {
              const sectorInfo = getSectorInfo(a.shift.sector_id || 'sem-setor');
              const isProcessing = processingId === a.id;
              const needsCheckin = assignmentNeedsCheckin(a);
              const needsCheckout = assignmentNeedsCheckout(a);
              const actionCopy = sectorInfo.checkin_enabled
                ? getCheckActionCopy(needsCheckin, needsCheckout, sectorInfo.require_gps_checkin)
                : null;

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
                      {sectorInfo.checkin_enabled && sectorInfo.require_gps_checkin && (
                        <div className="flex items-center gap-1 text-blue-600">
                          <MapPin className="h-4 w-4" />
                          GPS obrigatório no check-in/check-out
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

                    {actionCopy && (
                      <div
                        className={`rounded-lg px-3 py-2 text-sm ${
                          actionCopy.tone === 'amber'
                            ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            : 'border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        <div className="font-medium">{actionCopy.title}</div>
                        <div className="text-xs opacity-90">{actionCopy.description}</div>
                      </div>
                    )}

                    {/* Large Check-in/Check-out buttons for mobile */}
                    <div className="flex gap-2">
                      {sectorInfo.checkin_enabled && needsCheckin && (
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
                              {getCheckButtonLabel('checkin', sectorInfo.require_gps_checkin)}
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
                              {getCheckButtonLabel('checkout', sectorInfo.require_gps_checkin)}
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
            <p className="text-muted-foreground">Nenhum plantão seu neste mês</p>
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
                    <button type="button" className="w-full min-h-12 p-4 flex items-center justify-between hover:bg-muted/50 transition-colors touch-manipulation">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: sectorInfo.color }} />
                        <span className="font-semibold text-foreground">{sectorInfo.name}</span>
                        <Badge variant="secondary" className="ml-2">
                          {sectorAssignments.length} plantão{sectorAssignments.length !== 1 ? 'ões' : ''}
                        </Badge>
                        {sectorInfo.checkin_enabled && sectorInfo.require_gps_checkin && (
                          <Badge variant="outline" className="text-blue-600 border-blue-500/30 bg-blue-500/5">
                            <MapPin className="mr-1 h-3 w-3" />
                            GPS no check-in
                          </Badge>
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
                        {sectorAssignments.map((myAssignment) => {
                          const s = myAssignment.shift;
                          const shiftDate = parseDateOnly(s.shift_date);
                          const isShiftToday = isToday(shiftDate);
                          const isShiftTomorrow = isTomorrow(shiftDate);
                          const isShiftPast = isPast(shiftDate) && !isShiftToday;
                          const isProcessing = processingId === myAssignment.id;
                          const isMine = myAssignment.user_id === user?.id;
                          const needsCheckin = isMine && assignmentNeedsCheckin(myAssignment);
                          const needsCheckout = isMine && assignmentNeedsCheckout(myAssignment);
                          const actionCopy = sectorInfo.checkin_enabled
                            ? getCheckActionCopy(needsCheckin, needsCheckout, sectorInfo.require_gps_checkin)
                            : null;
                          const canRequestSwap =
                            isMine && !isShiftPast && (myAssignment.status === 'assigned' || myAssignment.status === 'confirmed');

                          return (
                            <div 
                              id={`assignment-${myAssignment.id}`}
                              key={myAssignment.id} 
                              className={`p-4 rounded-lg border bg-card transition-colors ${
                                isShiftToday ? 'border-primary/50 bg-primary/5' : 
                                isShiftTomorrow ? 'border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/20' :
                                'hover:bg-muted/30'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-medium text-foreground">{s.title}</h4>
                                    <Badge className={statusColors[myAssignment.status]} variant="outline">
                                      {statusLabels[myAssignment.status]}
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
                                      {s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-4 w-4" />
                                      {sectorInfo.name}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs uppercase tracking-wide">Plantonista:</span>
                                      <span className="font-medium text-foreground">
                                        {myAssignment.profile?.full_name ?? myAssignment.profile?.name ?? '—'}
                                      </span>
                                    </div>
                                  </div>

                                  <p className="text-sm font-medium text-primary">
                                    {displayValueByAssignmentId[myAssignment.id] !== null &&
                                    displayValueByAssignmentId[myAssignment.id] !== undefined
                                      ? `R$ ${Number(displayValueByAssignmentId[myAssignment.id]).toFixed(2)}`
                                      : 'Sem valor definido'}
                                  </p>

                                  {myAssignment?.checkin_at && (
                                    <div className="flex items-center gap-1 text-xs text-green-600">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Check-in: {format(new Date(myAssignment.checkin_at), 'HH:mm')}
                                      {myAssignment.checkout_at && ` | Check-out: ${format(new Date(myAssignment.checkout_at), 'HH:mm')}`}
                                    </div>
                                  )}

                                  {actionCopy && (
                                    <div
                                      className={`rounded-lg px-3 py-2 text-xs ${
                                        actionCopy.tone === 'amber'
                                          ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                          : 'border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                      }`}
                                    >
                                      <div className="font-medium">{actionCopy.title}</div>
                                      <div className="opacity-90">{actionCopy.description}</div>
                                    </div>
                                  )}
                                </div>

                                {/*
                                  Check-in/Check-out:
                                  - Check-in só quando o setor tem check-in habilitado
                                  - Check-out deve aparecer sempre que houver check-in pendente,
                                    mesmo se o setor tiver sido desativado depois.
                                */}
                                {(Boolean(myAssignment) && (sectorInfo.checkin_enabled || needsCheckout)) && (
                                  <div className="flex gap-2 flex-shrink-0">
                                    {sectorInfo.checkin_enabled && needsCheckin && (
                                      <Button
                                        size="sm"
                                        className="h-10 px-3 touch-manipulation"
                                        onClick={() => myAssignment && handleCheckin(myAssignment)}
                                        disabled={isProcessing || isShiftPast}
                                        title={isShiftPast ? 'Plantão passado' : undefined}
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <LogIn className="mr-2 h-4 w-4" />
                                        )}
                                        {getCheckButtonLabel('checkin', sectorInfo.require_gps_checkin)}
                                      </Button>
                                    )}

                                    {needsCheckout && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-10 px-3 touch-manipulation"
                                        onClick={() => myAssignment && handleCheckout(myAssignment)}
                                        // Permitir check-out mesmo em plantões passados se já houve check-in.
                                        disabled={isProcessing || (isShiftPast && !myAssignment?.checkin_at)}
                                        title={isShiftPast && !myAssignment?.checkin_at ? 'Plantão passado' : undefined}
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <LogOut className="mr-2 h-4 w-4" />
                                        )}
                                        {getCheckButtonLabel('checkout', sectorInfo.require_gps_checkin)}
                                      </Button>
                                    )}
                                  </div>
                                )}

                                {canRequestSwap && (
                                  <div className="flex-shrink-0">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="h-10 px-3 touch-manipulation"
                                      onClick={() => navigate(`/app/swaps?assignment=${encodeURIComponent(myAssignment.id)}`)}
                                    >
                                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                                      Passar plantão
                                    </Button>
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
