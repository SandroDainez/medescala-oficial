import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { FileSpreadsheet, Download, Plus, Calendar, UserMinus, MapPin, Check, X, Clock, FileText, Filter, Users, Building2, LogIn, LogOut, Trash2, AlertTriangle, ArrowRightLeft, DollarSign } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Absence {
  id: string;
  user_id: string;
  user_name: string;
  type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

interface Sector {
  id: string;
  name: string;
  checkin_enabled: boolean;
  require_gps_checkin: boolean;
  allowed_checkin_radius_meters: number | null;
  checkin_tolerance_minutes: number;
}

interface CheckinRecord {
  id: string;
  user_id: string;
  user_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_name: string;
  status: string;
  checkin_at: string | null;
  checkout_at: string | null;
  checkin_latitude: number | null;
  checkin_longitude: number | null;
  checkout_latitude: number | null;
  checkout_longitude: number | null;
}

interface ShiftReport {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_name: string;
  title: string;
  hospital: string;
  assignee_count: number;
  assignees: string[];
  base_value: number | null;
}

interface MovementRecord {
  id: string;
  movement_type: string;
  user_name: string;
  source_sector_name: string | null;
  source_shift_date: string | null;
  source_shift_time: string | null;
  destination_sector_name: string | null;
  destination_shift_date: string | null;
  destination_shift_time: string | null;
  performed_at: string;
  reason: string | null;
}

interface ConflictRecord {
  id: string;
  conflict_date: string;
  plantonista_name: string;
  resolution_type: string;
  removed_sector_name: string | null;
  removed_shift_time: string | null;
  kept_sector_name: string | null;
  kept_shift_time: string | null;
  justification: string | null;
  resolved_at: string;
}

interface FinancialSummaryRecord {
  user_id: string;
  user_name: string;
  total_shifts: number;
  total_hours: number;
  total_value: number;
}

const absenceTypeLabels: Record<string, string> = {
  falta: 'Falta',
  atestado: 'Atestado Médico',
  licenca: 'Licença',
  ferias: 'Férias',
  outro: 'Outro',
};

const absenceStatusLabels: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

const movementTypeLabels: Record<string, string> = {
  added: 'Adicionado',
  removed: 'Removido',
  swap: 'Troca',
  transferred: 'Transferência',
  conflict_resolution: 'Resolução de Conflito',
};

export default function AdminReports() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  
  const [reportType, setReportType] = useState('afastamentos');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedSector, setSelectedSector] = useState<string>('all');
  
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftReport[]>([]);
  const [financialData, setFinancialData] = useState<FinancialSummaryRecord[]>([]);
  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Selection for bulk delete
  const [selectedMovements, setSelectedMovements] = useState<Set<string>>(new Set());
  const [selectedConflicts, setSelectedConflicts] = useState<Set<string>>(new Set());
  const [selectedAbsences, setSelectedAbsences] = useState<Set<string>>(new Set());
  const [deleteMovementsDialogOpen, setDeleteMovementsDialogOpen] = useState(false);
  const [deleteConflictsDialogOpen, setDeleteConflictsDialogOpen] = useState(false);
  const [deleteAbsencesDialogOpen, setDeleteAbsencesDialogOpen] = useState(false);
  
  // Dialog states
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [sectorGpsDialogOpen, setSectorGpsDialogOpen] = useState(false);
  const [sectorToleranceDialogOpen, setSectorToleranceDialogOpen] = useState(false);
  const [selectedAbsence, setSelectedAbsence] = useState<Absence | null>(null);
  const [selectedSectorForGps, setSelectedSectorForGps] = useState<Sector | null>(null);
  
  // New absence form
  const [newAbsence, setNewAbsence] = useState({
    user_id: '',
    type: 'falta',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    notes: '',
  });
  
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (currentTenantId) {
      fetchSectors();
      fetchUsers();
    }
  }, [currentTenantId]);

  useEffect(() => {
    if (currentTenantId && reportType) {
      generateReport();
    }
  }, [currentTenantId, reportType, startDate, endDate, selectedSector]);

  async function fetchSectors() {
    const { data } = await supabase
      .from('sectors')
      .select('id, name, checkin_enabled, require_gps_checkin, allowed_checkin_radius_meters, checkin_tolerance_minutes')
      .eq('tenant_id', currentTenantId)
      .eq('active', true);
    
    if (data) setSectors(data as Sector[]);
  }

  async function fetchUsers() {
    const { data: memberships } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', currentTenantId)
      .eq('active', true);
    
    if (memberships) {
      const userIds = memberships.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      
      if (profiles) {
        setUsers(profiles.map(p => ({ id: p.id, name: p.name || 'Sem nome' })));
      }
    }
  }

  async function generateReport() {
    setLoading(true);
    
    if (reportType === 'afastamentos') {
      await fetchAbsences();
    } else if (reportType === 'checkins') {
      await fetchCheckins();
    } else if (reportType === 'plantoes') {
      await fetchShiftsReport();
    } else if (reportType === 'financeiro') {
      await fetchFinancialReport();
    } else if (reportType === 'movimentacoes') {
      await fetchMovements();
    } else if (reportType === 'conflitos') {
      await fetchConflicts();
    }
    
    setLoading(false);
  }

  async function fetchShiftsReport() {
    let query = supabase
      .from('shifts')
      .select('id, shift_date, start_time, end_time, sector_id, title, hospital, base_value')
      .eq('tenant_id', currentTenantId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)
      .order('shift_date', { ascending: false });
    
    if (selectedSector !== 'all') {
      query = query.eq('sector_id', selectedSector);
    }
    
    const { data: shiftsData, error: shiftsError } = await query;
    
    if (shiftsError || !shiftsData) {
      console.error('Error fetching shifts:', shiftsError);
      setShifts([]);
      return;
    }
    
    const shiftIds = shiftsData.map(s => s.id);
    if (shiftIds.length === 0) {
      setShifts([]);
      return;
    }
    
    const { data: assignments } = await supabase
      .from('shift_assignments')
      .select('shift_id, user_id')
      .in('shift_id', shiftIds);
    
    const userIds = [...new Set(assignments?.map(a => a.user_id) || [])];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds.length > 0 ? userIds : ['no-users']);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p.name || 'Sem nome']) || []);
    const sectorMap = new Map(sectors.map(s => [s.id, s.name]));
    
    const assignmentsByShift = new Map<string, string[]>();
    assignments?.forEach(a => {
      if (!assignmentsByShift.has(a.shift_id)) {
        assignmentsByShift.set(a.shift_id, []);
      }
      assignmentsByShift.get(a.shift_id)!.push(profileMap.get(a.user_id) || 'Sem nome');
    });
    
    const shiftReports: ShiftReport[] = shiftsData.map(s => ({
      id: s.id,
      shift_date: s.shift_date,
      start_time: s.start_time,
      end_time: s.end_time,
      sector_name: s.sector_id ? sectorMap.get(s.sector_id) || 'Sem setor' : 'Sem setor',
      title: s.title,
      hospital: s.hospital,
      base_value: s.base_value,
      assignee_count: assignmentsByShift.get(s.id)?.length || 0,
      assignees: assignmentsByShift.get(s.id) || [],
    }));
    
    setShifts(shiftReports);
  }

  async function fetchFinancialReport() {
    let query = supabase
      .from('shifts')
      .select('id, shift_date, start_time, end_time, sector_id, base_value')
      .eq('tenant_id', currentTenantId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate);
    
    if (selectedSector !== 'all') {
      query = query.eq('sector_id', selectedSector);
    }
    
    const { data: shiftsData } = await query;
    
    if (!shiftsData || shiftsData.length === 0) {
      setFinancialData([]);
      return;
    }
    
    const shiftIds = shiftsData.map(s => s.id);
    
    const { data: assignments } = await supabase
      .from('shift_assignments')
      .select('shift_id, user_id, assigned_value')
      .in('shift_id', shiftIds);
    
    if (!assignments) {
      setFinancialData([]);
      return;
    }
    
    const userIds = [...new Set(assignments.map(a => a.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p.name || 'Sem nome']) || []);
    const shiftMap = new Map(shiftsData.map(s => [s.id, s]));
    
    const userSummary = new Map<string, FinancialSummaryRecord>();
    
    for (const a of assignments) {
      const shift = shiftMap.get(a.shift_id);
      if (!shift) continue;
      
      if (!userSummary.has(a.user_id)) {
        userSummary.set(a.user_id, {
          user_id: a.user_id,
          user_name: profileMap.get(a.user_id) || 'Sem nome',
          total_shifts: 0,
          total_hours: 0,
          total_value: 0,
        });
      }
      
      const summary = userSummary.get(a.user_id)!;
      summary.total_shifts++;
      
      const [startH, startM] = shift.start_time.split(':').map(Number);
      const [endH, endM] = shift.end_time.split(':').map(Number);
      let hours = endH - startH;
      if (hours < 0) hours += 24;
      summary.total_hours += hours + (endM - startM) / 60;
      
      const value = a.assigned_value ?? shift.base_value ?? 0;
      if (typeof value === 'number' && value > 0) {
        summary.total_value += value;
      }
    }
    
    const financialRecords = Array.from(userSummary.values())
      .sort((a, b) => a.user_name.localeCompare(b.user_name, 'pt-BR'));
    
    setFinancialData(financialRecords);
  }

  async function fetchMovements() {
    const { data, error } = await supabase
      .from('schedule_movements')
      .select('*')
      .eq('tenant_id', currentTenantId)
      .order('performed_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching movements:', error);
      setMovements([]);
      return;
    }

    // Filter by date range client-side for proper handling
    const filteredByDate = data?.filter(m => {
      const sourceInRange = m.source_shift_date && 
        m.source_shift_date >= startDate && 
        m.source_shift_date <= endDate;
      const destInRange = m.destination_shift_date && 
        m.destination_shift_date >= startDate && 
        m.destination_shift_date <= endDate;
      const performedInRange = m.performed_at.substring(0, 10) >= startDate && 
        m.performed_at.substring(0, 10) <= endDate;
      
      return sourceInRange || destInRange || performedInRange;
    }) || [];
    
    // Filter by sector if selected
    const filtered = selectedSector === 'all' 
      ? filteredByDate 
      : filteredByDate.filter(m => m.source_sector_id === selectedSector || m.destination_sector_id === selectedSector);
    
    const movementRecords: MovementRecord[] = filtered.map(m => ({
      id: m.id,
      movement_type: m.movement_type,
      user_name: m.user_name,
      source_sector_name: m.source_sector_name,
      source_shift_date: m.source_shift_date,
      source_shift_time: m.source_shift_time,
      destination_sector_name: m.destination_sector_name,
      destination_shift_date: m.destination_shift_date,
      destination_shift_time: m.destination_shift_time,
      performed_at: m.performed_at,
      reason: m.reason,
    }));
    
    setMovements(movementRecords);
  }

  async function fetchConflicts() {
    const { data, error } = await supabase
      .from('conflict_resolutions')
      .select('*')
      .eq('tenant_id', currentTenantId)
      .gte('conflict_date', startDate)
      .lte('conflict_date', endDate)
      .order('resolved_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching conflicts:', error);
      setConflicts([]);
      return;
    }
    
    const conflictRecords: ConflictRecord[] = (data || []).map(c => ({
      id: c.id,
      conflict_date: c.conflict_date,
      plantonista_name: c.plantonista_name,
      resolution_type: c.resolution_type,
      removed_sector_name: c.removed_sector_name,
      removed_shift_time: c.removed_shift_time,
      kept_sector_name: c.kept_sector_name,
      kept_shift_time: c.kept_shift_time,
      justification: c.justification,
      resolved_at: c.resolved_at,
    }));
    
    setConflicts(conflictRecords);
  }

  async function fetchAbsences() {
    const { data, error } = await supabase
      .from('absences')
      .select('*')
      .eq('tenant_id', currentTenantId)
      .gte('start_date', startDate)
      .lte('end_date', endDate)
      .order('start_date', { ascending: false });
    
    if (error) {
      console.error('Error fetching absences:', error);
      return;
    }
    
    if (data) {
      const userIds = [...new Set(data.map(a => a.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p.name]) || []);
      
      setAbsences(data.map(a => ({
        ...a,
        user_name: profileMap.get(a.user_id) || 'Sem nome',
      })));
    }
  }

  async function fetchCheckins() {
    // Primeiro, buscar setores com check-in ativado
    const enabledSectorIds = sectors.filter(s => s.checkin_enabled).map(s => s.id);
    
    if (enabledSectorIds.length === 0) {
      setCheckins([]);
      return;
    }
    
    // Buscar apenas plantões de setores com check-in ativado E que já aconteceram (data <= hoje)
    const today = new Date().toISOString().split('T')[0];
    
    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('id, shift_date, start_time, end_time, sector_id')
      .eq('tenant_id', currentTenantId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate <= today ? endDate : today) // Não mostrar plantões futuros
      .in('sector_id', enabledSectorIds);
    
    if (!shiftsData || shiftsData.length === 0) {
      setCheckins([]);
      return;
    }
    
    const shiftIds = shiftsData.map(s => s.id);
    
    // Fetch assignments (without GPS columns - they're in separate table now)
    const { data: assignments } = await supabase
      .from('shift_assignments')
      .select(`id, user_id, checkin_at, checkout_at, shift_id, status`)
      .in('shift_id', shiftIds);
    
    if (!assignments) {
      setCheckins([]);
      return;
    }

    // Fetch location data from the new table
    const assignmentIds = assignments.map(a => a.id);
    const { data: locations } = await supabase
      .from('shift_assignment_locations')
      .select('assignment_id, checkin_latitude, checkin_longitude, checkout_latitude, checkout_longitude')
      .in('assignment_id', assignmentIds);

    const locationMap = new Map(locations?.map(l => [l.assignment_id, l]) || []);
    
    // Get user names
    const userIds = [...new Set(assignments.map(a => a.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p.name]) || []);
    const shiftMap = new Map(shiftsData.map(s => [s.id, s]));
    const sectorMap = new Map(sectors.map(s => [s.id, s.name]));
    
    const checkinRecords: CheckinRecord[] = assignments
      .filter(a => {
        const shift = shiftMap.get(a.shift_id);
        // Filtrar por setor selecionado (se não for 'all')
        if (selectedSector !== 'all' && shift?.sector_id !== selectedSector) {
          return false;
        }
        return true;
      })
      .map(a => {
        const shift = shiftMap.get(a.shift_id);
        const loc = locationMap.get(a.id);
        return {
          id: a.id,
          user_id: a.user_id,
          user_name: profileMap.get(a.user_id) || 'Sem nome',
          shift_date: shift?.shift_date || '',
          start_time: shift?.start_time || '',
          end_time: shift?.end_time || '',
          sector_name: shift?.sector_id ? sectorMap.get(shift.sector_id) || 'Sem setor' : 'Sem setor',
          status: a.status || 'assigned',
          checkin_at: a.checkin_at,
          checkout_at: a.checkout_at,
          checkin_latitude: loc?.checkin_latitude ?? null,
          checkin_longitude: loc?.checkin_longitude ?? null,
          checkout_latitude: loc?.checkout_latitude ?? null,
          checkout_longitude: loc?.checkout_longitude ?? null,
        };
      })
      .sort((a, b) => b.shift_date.localeCompare(a.shift_date)); // Ordenar por data mais recente
    
    setCheckins(checkinRecords);
  }

  async function handleCreateAbsence() {
    if (!newAbsence.user_id || !newAbsence.type || !newAbsence.start_date) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }
    
    const { error } = await supabase
      .from('absences')
      .insert({
        tenant_id: currentTenantId,
        user_id: newAbsence.user_id,
        type: newAbsence.type,
        start_date: newAbsence.start_date,
        end_date: newAbsence.end_date || newAbsence.start_date,
        reason: newAbsence.reason || null,
        notes: newAbsence.notes || null,
        status: 'approved', // Admin creates as approved
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        created_by: user?.id,
      });
    
    if (error) {
      toast({ title: 'Erro ao criar ausência', description: error.message, variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Ausência registrada com sucesso' });
    setAbsenceDialogOpen(false);
    setNewAbsence({
      user_id: '',
      type: 'falta',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: format(new Date(), 'yyyy-MM-dd'),
      reason: '',
      notes: '',
    });
    fetchAbsences();
  }

  async function handleUpdateAbsenceStatus(absenceId: string, status: string) {
    const { error } = await supabase
      .from('absences')
      .update({
        status,
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq('id', absenceId);
    
    if (error) {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
      return;
    }
    
    toast({ title: `Ausência ${status === 'approved' ? 'aprovada' : 'rejeitada'}` });
    fetchAbsences();
  }

  async function handleToggleSectorCheckin(sector: Sector) {
    const { error } = await supabase
      .from('sectors')
      .update({
        checkin_enabled: !sector.checkin_enabled,
        updated_by: user?.id,
      })
      .eq('id', sector.id);
    
    if (error) {
      toast({ title: 'Erro ao atualizar setor', variant: 'destructive' });
      return;
    }
    
    toast({ title: `Check-in ${!sector.checkin_enabled ? 'ativado' : 'desativado'} para ${sector.name}` });
    fetchSectors();
  }

  async function handleToggleSectorGps(sector: Sector) {
    const { error } = await supabase
      .from('sectors')
      .update({
        require_gps_checkin: !sector.require_gps_checkin,
        updated_by: user?.id,
      })
      .eq('id', sector.id);
    
    if (error) {
      toast({ title: 'Erro ao atualizar setor', variant: 'destructive' });
      return;
    }
    
    toast({ title: `GPS ${!sector.require_gps_checkin ? 'ativado' : 'desativado'} para ${sector.name}` });
    fetchSectors();
  }

  async function handleUpdateSectorRadius(sectorId: string, radius: number) {
    const { error } = await supabase
      .from('sectors')
      .update({
        allowed_checkin_radius_meters: radius,
        updated_by: user?.id,
      })
      .eq('id', sectorId);
    
    if (error) {
      toast({ title: 'Erro ao atualizar raio', variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Raio de check-in atualizado' });
    setSectorGpsDialogOpen(false);
    fetchSectors();
  }

  // Admin manual check-in/check-out
  async function handleAdminCheckin(assignmentId: string) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({
        checkin_at: new Date().toISOString(),
        status: 'confirmed',
        updated_by: user?.id,
      })
      .eq('id', assignmentId);
    
    if (error) {
      toast({ title: 'Erro ao registrar check-in', variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Check-in registrado manualmente' });
    fetchCheckins();
  }

  async function handleAdminCheckout(assignmentId: string) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({
        checkout_at: new Date().toISOString(),
        status: 'completed',
        updated_by: user?.id,
      })
      .eq('id', assignmentId);
    
    if (error) {
      toast({ title: 'Erro ao registrar check-out', variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Check-out registrado manualmente' });
    fetchCheckins();
  }

  async function handleClearCheckin(assignmentId: string) {
    // Clear checkin data in shift_assignments
    const { error } = await supabase
      .from('shift_assignments')
      .update({
        checkin_at: null,
        checkout_at: null,
        status: 'assigned',
        updated_by: user?.id,
      })
      .eq('id', assignmentId);
    
    if (error) {
      toast({ title: 'Erro ao limpar registros', variant: 'destructive' });
      return;
    }

    // Clear location data in separate table
    await supabase
      .from('shift_assignment_locations')
      .update({
        checkin_latitude: null,
        checkin_longitude: null,
        checkout_latitude: null,
        checkout_longitude: null,
      })
      .eq('assignment_id', assignmentId);
    
    toast({ title: 'Registros de presença limpos' });
    fetchCheckins();
  }

  // Bulk delete functions
  async function handleDeleteMovements() {
    if (selectedMovements.size === 0) return;
    const { error } = await supabase
      .from('schedule_movements')
      .delete()
      .in('id', Array.from(selectedMovements));
    
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${selectedMovements.size} movimentação(ões) excluída(s)` });
      setSelectedMovements(new Set());
      fetchMovements();
    }
    setDeleteMovementsDialogOpen(false);
  }

  async function handleDeleteConflicts() {
    if (selectedConflicts.size === 0) return;
    const { error } = await supabase
      .from('conflict_resolutions')
      .delete()
      .in('id', Array.from(selectedConflicts));
    
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${selectedConflicts.size} conflito(s) excluído(s)` });
      setSelectedConflicts(new Set());
      fetchConflicts();
    }
    setDeleteConflictsDialogOpen(false);
  }

  async function handleDeleteAbsences() {
    if (selectedAbsences.size === 0) return;
    const { error } = await supabase
      .from('absences')
      .delete()
      .in('id', Array.from(selectedAbsences));
    
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${selectedAbsences.size} afastamento(s) excluído(s)` });
      setSelectedAbsences(new Set());
      fetchAbsences();
    }
    setDeleteAbsencesDialogOpen(false);
  }

  function toggleSelectMovement(id: string) {
    setSelectedMovements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }

  function toggleSelectAllMovements() {
    if (selectedMovements.size === movements.length) {
      setSelectedMovements(new Set());
    } else {
      setSelectedMovements(new Set(movements.map(m => m.id)));
    }
  }

  function toggleSelectConflict(id: string) {
    setSelectedConflicts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }

  function toggleSelectAllConflicts() {
    if (selectedConflicts.size === conflicts.length) {
      setSelectedConflicts(new Set());
    } else {
      setSelectedConflicts(new Set(conflicts.map(c => c.id)));
    }
  }

  function toggleSelectAbsence(id: string) {
    setSelectedAbsences(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }

  function toggleSelectAllAbsences() {
    if (selectedAbsences.size === absences.length) {
      setSelectedAbsences(new Set());
    } else {
      setSelectedAbsences(new Set(absences.map(a => a.id)));
    }
  }

  function exportToXLS() {
    let csvContent = '';
    
    if (reportType === 'afastamentos') {
      csvContent = 'Plantonista,Tipo,Data Início,Data Fim,Motivo,Status,Observações\n';
      absences.forEach(a => {
        csvContent += `"${a.user_name}","${absenceTypeLabels[a.type] || a.type}","${format(parseISO(a.start_date), 'dd/MM/yyyy')}","${format(parseISO(a.end_date), 'dd/MM/yyyy')}","${a.reason || ''}","${absenceStatusLabels[a.status] || a.status}","${a.notes || ''}"\n`;
      });
    } else if (reportType === 'checkins') {
      csvContent = 'Plantonista,Data,Horário,Setor,Check-in,Check-out,GPS Check-in,GPS Check-out\n';
      checkins.forEach(c => {
        const gpsIn = c.checkin_latitude ? `${c.checkin_latitude},${c.checkin_longitude}` : 'N/A';
        const gpsOut = c.checkout_latitude ? `${c.checkout_latitude},${c.checkout_longitude}` : 'N/A';
        csvContent += `"${c.user_name}","${format(parseISO(c.shift_date), 'dd/MM/yyyy')}","${c.start_time} - ${c.end_time}","${c.sector_name}","${c.checkin_at ? format(parseISO(c.checkin_at), 'HH:mm') : 'Não registrado'}","${c.checkout_at ? format(parseISO(c.checkout_at), 'HH:mm') : 'Não registrado'}","${gpsIn}","${gpsOut}"\n`;
      });
    }
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_${reportType}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Relatórios</h1>
          <p className="text-muted-foreground">Relatórios gerenciais e financeiros</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros do Relatório
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Tipo de Relatório</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="afastamentos">Afastamentos</SelectItem>
                  <SelectItem value="checkins">Check-ins/Check-outs</SelectItem>
                  <SelectItem value="plantoes">Plantões por Período</SelectItem>
                  <SelectItem value="financeiro">Resumo Financeiro</SelectItem>
                  <SelectItem value="movimentacoes">Movimentações de Escala</SelectItem>
                  <SelectItem value="conflitos">Histórico de Conflitos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {['checkins', 'plantoes', 'financeiro', 'movimentacoes'].includes(reportType) && (
              <div className="space-y-2">
                <Label>Setor</Label>
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os setores</SelectItem>
                    {(reportType === 'checkins' ? sectors.filter(s => s.checkin_enabled) : sectors).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reportType === 'checkins' && sectors.filter(s => s.checkin_enabled).length === 0 && (
                  <p className="text-xs text-destructive">
                    Nenhum setor com check-in ativo. Ative na aba "Configurar GPS".
                  </p>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            
            <div className="flex items-end gap-2">
              <Button onClick={generateReport} className="flex-1">
                <FileText className="mr-2 h-4 w-4" />
                Gerar
              </Button>
              <Button variant="outline" onClick={exportToXLS}>
                <Download className="mr-2 h-4 w-4" />
                XLS
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="report" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="report">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Relatório
          </TabsTrigger>
          <TabsTrigger value="conflicts">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Conflitos
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Clock className="mr-2 h-4 w-4" />
            Pendentes
          </TabsTrigger>
          <TabsTrigger value="absences">
            <UserMinus className="mr-2 h-4 w-4" />
            Ausências
          </TabsTrigger>
          <TabsTrigger value="gps">
            <MapPin className="mr-2 h-4 w-4" />
            Configurar GPS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {reportType === 'afastamentos' && 'Relatório de Afastamentos'}
                {reportType === 'checkins' && 'Relatório de Check-ins'}
                {reportType === 'plantoes' && 'Plantões por Período'}
                {reportType === 'financeiro' && 'Resumo Financeiro'}
                {reportType === 'movimentacoes' && 'Movimentações de Escala'}
                {reportType === 'conflitos' && 'Histórico de Conflitos'}
              </CardTitle>
              <Badge variant="secondary">
                {reportType === 'afastamentos' && `${absences.length} registros`}
                {reportType === 'checkins' && `${checkins.length} registros`}
                {reportType === 'plantoes' && `${shifts.length} plantões`}
                {reportType === 'financeiro' && `${financialData.length} plantonistas`}
                {reportType === 'movimentacoes' && `${movements.length} movimentos`}
                {reportType === 'conflitos' && `${conflicts.length} resoluções`}
              </Badge>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : reportType === 'afastamentos' ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plantonista</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Observações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {absences.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            Nenhum afastamento encontrado no período
                          </TableCell>
                        </TableRow>
                      ) : (
                        absences.map(absence => (
                          <TableRow key={absence.id}>
                            <TableCell className="font-medium">{absence.user_name}</TableCell>
                            <TableCell>
                              <Badge variant={absence.type === 'falta' ? 'destructive' : 'secondary'}>
                                {absenceTypeLabels[absence.type] || absence.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {format(parseISO(absence.start_date), 'dd/MM/yyyy')}
                              {absence.start_date !== absence.end_date && (
                                <> a {format(parseISO(absence.end_date), 'dd/MM/yyyy')}</>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{absence.reason || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={
                                absence.status === 'approved' ? 'default' :
                                absence.status === 'rejected' ? 'destructive' : 'secondary'
                              }>
                                {absenceStatusLabels[absence.status] || absence.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">{absence.notes || '-'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : reportType === 'checkins' ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plantonista</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Horário</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Check-out</TableHead>
                        <TableHead>GPS</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checkins.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            Nenhum registro de check-in encontrado no período
                          </TableCell>
                        </TableRow>
                      ) : (
                        checkins.map(checkin => (
                          <TableRow key={checkin.id}>
                            <TableCell className="font-medium">{checkin.user_name}</TableCell>
                            <TableCell>{format(parseISO(checkin.shift_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell>{checkin.start_time?.slice(0, 5)} - {checkin.end_time?.slice(0, 5)}</TableCell>
                            <TableCell>{checkin.sector_name}</TableCell>
                            <TableCell>
                              {checkin.checkin_at ? (
                                <Badge variant="default" className="gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(parseISO(checkin.checkin_at), 'HH:mm')}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Não registrado</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {checkin.checkout_at ? (
                                <Badge variant="default" className="gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(parseISO(checkin.checkout_at), 'HH:mm')}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Não registrado</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {checkin.checkin_latitude ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(`https://maps.google.com/?q=${checkin.checkin_latitude},${checkin.checkin_longitude}`, '_blank')}
                                >
                                  <MapPin className="h-4 w-4 text-primary" />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {!checkin.checkin_at && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAdminCheckin(checkin.id)}
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                    title="Registrar check-in manual"
                                  >
                                    <LogIn className="h-4 w-4" />
                                  </Button>
                                )}
                                {checkin.checkin_at && !checkin.checkout_at && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAdminCheckout(checkin.id)}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    title="Registrar check-out manual"
                                  >
                                    <LogOut className="h-4 w-4" />
                                  </Button>
                                )}
                                {checkin.checkin_at && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleClearCheckin(checkin.id)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    title="Limpar registros de presença"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : reportType === 'plantoes' ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Horário</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Hospital</TableHead>
                        <TableHead>Valor Base</TableHead>
                        <TableHead>Plantonistas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shifts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            Nenhum plantão encontrado no período
                          </TableCell>
                        </TableRow>
                      ) : (
                        shifts.map(shift => (
                          <TableRow key={shift.id}>
                            <TableCell>{format(parseISO(shift.shift_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell>{shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)}</TableCell>
                            <TableCell>{shift.sector_name}</TableCell>
                            <TableCell className="font-medium">{shift.title}</TableCell>
                            <TableCell>{shift.hospital}</TableCell>
                            <TableCell>
                              {shift.base_value ? (
                                <Badge variant="default">R$ {Number(shift.base_value).toFixed(2)}</Badge>
                              ) : (
                                <Badge variant="secondary">-</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{shift.assignee_count}</Badge>
                                {shift.assignees.length > 0 && (
                                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                                    {shift.assignees.join(', ')}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : reportType === 'financeiro' ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plantonista</TableHead>
                        <TableHead className="text-center">Plantões</TableHead>
                        <TableHead className="text-center">Horas</TableHead>
                        <TableHead className="text-right">Total a Receber</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financialData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Nenhum dado financeiro no período
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {financialData.map(record => (
                            <TableRow key={record.user_id}>
                              <TableCell className="font-medium">{record.user_name}</TableCell>
                              <TableCell className="text-center">{record.total_shifts}</TableCell>
                              <TableCell className="text-center">{record.total_hours.toFixed(1)}h</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="default" className="gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  R$ {record.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell>TOTAL</TableCell>
                            <TableCell className="text-center">{financialData.reduce((sum, r) => sum + r.total_shifts, 0)}</TableCell>
                            <TableCell className="text-center">{financialData.reduce((sum, r) => sum + r.total_hours, 0).toFixed(1)}h</TableCell>
                            <TableCell className="text-right">
                              R$ {financialData.reduce((sum, r) => sum + r.total_value, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : reportType === 'movimentacoes' ? (
                <div className="space-y-4">
                  {selectedMovements.size > 0 && (
                    <div className="flex justify-end">
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => setDeleteMovementsDialogOpen(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir ({selectedMovements.size})
                      </Button>
                    </div>
                  )}
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={selectedMovements.size === movements.length && movements.length > 0}
                              onCheckedChange={toggleSelectAllMovements}
                            />
                          </TableHead>
                          <TableHead>Data/Hora</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Plantonista</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead>Destino</TableHead>
                          <TableHead>Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movements.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              Nenhuma movimentação encontrada no período
                            </TableCell>
                          </TableRow>
                        ) : (
                          movements.map(movement => (
                            <TableRow key={movement.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedMovements.has(movement.id)}
                                  onCheckedChange={() => toggleSelectMovement(movement.id)}
                                />
                              </TableCell>
                              <TableCell>{format(parseISO(movement.performed_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="gap-1">
                                  <ArrowRightLeft className="h-3 w-3" />
                                  {movementTypeLabels[movement.movement_type] || movement.movement_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{movement.user_name}</TableCell>
                              <TableCell>
                                {movement.source_sector_name ? (
                                  <div className="text-sm">
                                    <div>{movement.source_sector_name}</div>
                                    {movement.source_shift_date && (
                                      <div className="text-muted-foreground text-xs">
                                        {format(parseISO(movement.source_shift_date), 'dd/MM')} {movement.source_shift_time || ''}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {movement.destination_sector_name ? (
                                  <div className="text-sm">
                                    <div>{movement.destination_sector_name}</div>
                                    {movement.destination_shift_date && (
                                      <div className="text-muted-foreground text-xs">
                                        {format(parseISO(movement.destination_shift_date), 'dd/MM')} {movement.destination_shift_time || ''}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate">{movement.reason || '-'}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              ) : reportType === 'conflitos' ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data Conflito</TableHead>
                        <TableHead>Plantonista</TableHead>
                        <TableHead>Resolução</TableHead>
                        <TableHead>Removido de</TableHead>
                        <TableHead>Mantido em</TableHead>
                        <TableHead>Justificativa</TableHead>
                        <TableHead>Resolvido em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conflicts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            Nenhum conflito resolvido no período
                          </TableCell>
                        </TableRow>
                      ) : (
                        conflicts.map(conflict => (
                          <TableRow key={conflict.id}>
                            <TableCell>{format(parseISO(conflict.conflict_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell className="font-medium">{conflict.plantonista_name}</TableCell>
                            <TableCell>
                              <Badge variant={conflict.resolution_type === 'removed' ? 'destructive' : 'secondary'}>
                                {conflict.resolution_type === 'removed' ? 'Removido' : 'Reconhecido'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {conflict.removed_sector_name ? (
                                <div className="text-sm">
                                  <div>{conflict.removed_sector_name}</div>
                                  {conflict.removed_shift_time && (
                                    <div className="text-muted-foreground text-xs">{conflict.removed_shift_time}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {conflict.kept_sector_name ? (
                                <div className="text-sm">
                                  <div>{conflict.kept_sector_name}</div>
                                  {conflict.kept_shift_time && (
                                    <div className="text-muted-foreground text-xs">{conflict.kept_shift_time}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{conflict.justification || '-'}</TableCell>
                            <TableCell>{format(parseISO(conflict.resolved_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conflicts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Histórico de Conflitos Resolvidos
              </CardTitle>
              {selectedConflicts.size > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setDeleteConflictsDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir ({selectedConflicts.size})
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectedConflicts.size === conflicts.length && conflicts.length > 0}
                          onCheckedChange={toggleSelectAllConflicts}
                        />
                      </TableHead>
                      <TableHead>Data Conflito</TableHead>
                      <TableHead>Plantonista</TableHead>
                      <TableHead>Resolução</TableHead>
                      <TableHead>Removido de</TableHead>
                      <TableHead>Mantido em</TableHead>
                      <TableHead>Justificativa</TableHead>
                      <TableHead>Resolvido em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conflicts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Nenhum conflito resolvido no período. Selecione um período e clique em "Gerar" para ver conflitos.
                        </TableCell>
                      </TableRow>
                    ) : (
                      conflicts.map(conflict => (
                        <TableRow key={conflict.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedConflicts.has(conflict.id)}
                              onCheckedChange={() => toggleSelectConflict(conflict.id)}
                            />
                          </TableCell>
                          <TableCell>{format(parseISO(conflict.conflict_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="font-medium">{conflict.plantonista_name}</TableCell>
                          <TableCell>
                            <Badge variant={conflict.resolution_type === 'removed' ? 'destructive' : 'secondary'}>
                              {conflict.resolution_type === 'removed' ? 'Removido' : 'Reconhecido'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {conflict.removed_sector_name ? (
                              <div className="text-sm">
                                <div>{conflict.removed_sector_name}</div>
                                {conflict.removed_shift_time && (
                                  <div className="text-muted-foreground text-xs">{conflict.removed_shift_time}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {conflict.kept_sector_name ? (
                              <div className="text-sm">
                                <div>{conflict.kept_sector_name}</div>
                                {conflict.kept_shift_time && (
                                  <div className="text-muted-foreground text-xs">{conflict.kept_shift_time}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{conflict.justification || '-'}</TableCell>
                          <TableCell>{format(parseISO(conflict.resolved_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="absences">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserMinus className="h-5 w-5" />
                Gerenciar Ausências
              </CardTitle>
              <div className="flex gap-2">
                {selectedAbsences.size > 0 && (
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => setDeleteAbsencesDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir ({selectedAbsences.size})
                  </Button>
                )}
                <Button onClick={() => setAbsenceDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Ausência
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectedAbsences.size === absences.length && absences.length > 0}
                          onCheckedChange={toggleSelectAllAbsences}
                        />
                      </TableHead>
                      <TableHead>Plantonista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absences.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nenhuma ausência registrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      absences.map(absence => (
                        <TableRow key={absence.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedAbsences.has(absence.id)}
                              onCheckedChange={() => toggleSelectAbsence(absence.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{absence.user_name}</TableCell>
                          <TableCell>
                            <Badge variant={absence.type === 'falta' ? 'destructive' : 'secondary'}>
                              {absenceTypeLabels[absence.type] || absence.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(parseISO(absence.start_date), 'dd/MM/yyyy')}
                            {absence.start_date !== absence.end_date && (
                              <> a {format(parseISO(absence.end_date), 'dd/MM/yyyy')}</>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{absence.reason || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={
                              absence.status === 'approved' ? 'default' :
                              absence.status === 'rejected' ? 'destructive' : 'secondary'
                            }>
                              {absenceStatusLabels[absence.status] || absence.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {absence.status === 'pending' && (
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateAbsenceStatus(absence.id, 'approved')}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateAbsenceStatus(absence.id, 'rejected')}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Plantões Sem Check-in
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Lista de plantonistas que não realizaram check-in nos plantões do período selecionado.
              </p>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plantonista</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Horário Previsto</TableHead>
                      <TableHead>Setor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checkins.filter(c => !c.checkin_at).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Todos os plantonistas do período fizeram check-in
                        </TableCell>
                      </TableRow>
                    ) : (
                      checkins.filter(c => !c.checkin_at).map(checkin => (
                        <TableRow key={checkin.id} className="bg-yellow-50/50">
                          <TableCell className="font-medium">{checkin.user_name}</TableCell>
                          <TableCell>{format(parseISO(checkin.shift_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>{checkin.start_time?.slice(0, 5)} - {checkin.end_time?.slice(0, 5)}</TableCell>
                          <TableCell>{checkin.sector_name}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">Sem check-in</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAdminCheckin(checkin.id)}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <LogIn className="mr-2 h-4 w-4" />
                              Check-in Manual
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gps">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Configurar Check-in por Setor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Ative o controle de check-in/check-out, GPS e tolerância para os setores desejados.
                <br />
                <span className="text-xs">Alertas são enviados: 15 min antes, na hora e 15 min depois do início. Após a tolerância, o plantonista é marcado como ausente.</span>
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setor</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>GPS</TableHead>
                    <TableHead>Raio</TableHead>
                    <TableHead>Tolerância</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectors.map(sector => (
                    <TableRow key={sector.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {sector.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sector.checkin_enabled ? 'default' : 'secondary'}>
                          {sector.checkin_enabled ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sector.require_gps_checkin ? 'default' : 'secondary'}>
                          {sector.require_gps_checkin ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {sector.require_gps_checkin ? (
                          <span>{sector.allowed_checkin_radius_meters || 500}m</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sector.checkin_enabled ? (
                          <span>{sector.checkin_tolerance_minutes || 30} min</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Button
                            variant={sector.checkin_enabled ? 'destructive' : 'default'}
                            size="sm"
                            onClick={() => handleToggleSectorCheckin(sector)}
                          >
                            {sector.checkin_enabled ? 'Desativar' : 'Ativar'}
                          </Button>
                          {sector.checkin_enabled && (
                            <>
                              <Button
                                variant={sector.require_gps_checkin ? 'secondary' : 'outline'}
                                size="sm"
                                onClick={() => handleToggleSectorGps(sector)}
                              >
                                GPS {sector.require_gps_checkin ? 'On' : 'Off'}
                              </Button>
                              {sector.require_gps_checkin && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedSectorForGps(sector);
                                    setSectorGpsDialogOpen(true);
                                  }}
                                >
                                  {sector.allowed_checkin_radius_meters || 500}m
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedSectorForGps(sector);
                                  setSectorToleranceDialogOpen(true);
                                }}
                              >
                                {sector.checkin_tolerance_minutes || 30}min
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Nova Ausência */}
      <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Nova Ausência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Plantonista *</Label>
              <Select value={newAbsence.user_id} onValueChange={(v) => setNewAbsence({ ...newAbsence, user_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o plantonista" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={newAbsence.type} onValueChange={(v) => setNewAbsence({ ...newAbsence, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="falta">Falta</SelectItem>
                  <SelectItem value="atestado">Atestado Médico</SelectItem>
                  <SelectItem value="licenca">Licença</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Início *</Label>
                <Input
                  type="date"
                  value={newAbsence.start_date}
                  onChange={(e) => setNewAbsence({ ...newAbsence, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Fim</Label>
                <Input
                  type="date"
                  value={newAbsence.end_date}
                  onChange={(e) => setNewAbsence({ ...newAbsence, end_date: e.target.value })}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input
                value={newAbsence.reason}
                onChange={(e) => setNewAbsence({ ...newAbsence, reason: e.target.value })}
                placeholder="Motivo da ausência"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={newAbsence.notes}
                onChange={(e) => setNewAbsence({ ...newAbsence, notes: e.target.value })}
                placeholder="Observações adicionais"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbsenceDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateAbsence}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Configurar Raio GPS */}
      <Dialog open={sectorGpsDialogOpen} onOpenChange={setSectorGpsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Raio de Check-in</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Define o raio máximo (em metros) permitido para realizar o check-in no setor <strong>{selectedSectorForGps?.name}</strong>.
            </p>
            <div className="space-y-2">
              <Label>Raio em metros</Label>
              <Input
                type="number"
                defaultValue={selectedSectorForGps?.allowed_checkin_radius_meters || 500}
                id="radius-input"
                min={50}
                max={5000}
                step={50}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectorGpsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              const input = document.getElementById('radius-input') as HTMLInputElement;
              if (selectedSectorForGps && input) {
                handleUpdateSectorRadius(selectedSectorForGps.id, parseInt(input.value));
              }
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Configurar Tolerância */}
      <Dialog open={sectorToleranceDialogOpen} onOpenChange={setSectorToleranceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Tolerância de Check-in</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Define o tempo máximo (em minutos) após o início do plantão para realizar o check-in no setor <strong>{selectedSectorForGps?.name}</strong>.
              <br /><br />
              Após esse período sem check-in, o plantonista será automaticamente marcado como <strong>ausente</strong>.
            </p>
            <div className="space-y-2">
              <Label>Tolerância em minutos</Label>
              <Input
                type="number"
                defaultValue={selectedSectorForGps?.checkin_tolerance_minutes || 30}
                id="tolerance-input"
                min={5}
                max={120}
                step={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectorToleranceDialogOpen(false)}>Cancelar</Button>
            <Button onClick={async () => {
              const input = document.getElementById('tolerance-input') as HTMLInputElement;
              if (selectedSectorForGps && input) {
                const { error } = await supabase
                  .from('sectors')
                  .update({
                    checkin_tolerance_minutes: parseInt(input.value),
                    updated_by: user?.id,
                  })
                  .eq('id', selectedSectorForGps.id);
                
                if (error) {
                  toast({ title: 'Erro ao atualizar tolerância', variant: 'destructive' });
                } else {
                  toast({ title: 'Tolerância atualizada' });
                  setSectorToleranceDialogOpen(false);
                  fetchSectors();
                }
              }
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão de movimentações */}
      <Dialog open={deleteMovementsDialogOpen} onOpenChange={setDeleteMovementsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Movimentações</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir {selectedMovements.size} movimentação(ões)? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMovementsDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteMovements}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão de conflitos */}
      <Dialog open={deleteConflictsDialogOpen} onOpenChange={setDeleteConflictsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Conflitos</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir {selectedConflicts.size} conflito(s)? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConflictsDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteConflicts}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão de afastamentos */}
      <Dialog open={deleteAbsencesDialogOpen} onOpenChange={setDeleteAbsencesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Afastamentos</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir {selectedAbsences.size} afastamento(s)? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAbsencesDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteAbsences}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
