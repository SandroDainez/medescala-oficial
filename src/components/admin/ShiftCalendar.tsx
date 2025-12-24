import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Plus, UserPlus, Trash2, Edit, Users, Clock, MapPin, Calendar, LayoutGrid, Moon, Sun, Printer } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Sector {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
}

interface Shift {
  id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  base_value: number;
  notes: string | null;
  sector_id: string | null;
}

interface ShiftAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_value: number;
  status: string;
  profile: { name: string | null } | null;
}

interface Member {
  user_id: string;
  profile: { id: string; name: string | null } | null;
}

interface SectorMembership {
  id: string;
  sector_id: string;
  user_id: string;
}

type ViewMode = 'month' | 'week';
type ShiftAssignmentType = 'vago' | 'disponivel' | string; // string is user_id

export default function ShiftCalendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sectorMemberships, setSectorMemberships] = useState<SectorMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [filterSector, setFilterSector] = useState<string>(searchParams.get('sector') || 'all');
  
  // Dialogs
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  
  // Form data
  const [formData, setFormData] = useState({
    hospital: '',
    location: '',
    shift_date: '',
    start_time: '',
    end_time: '',
    base_value: '',
    notes: '',
    sector_id: '',
    assigned_user_id: '',
    duration_hours: '',
  });

  const [assignData, setAssignData] = useState({
    user_id: '',
    assigned_value: '',
  });

  useEffect(() => {
    if (currentTenantId) {
      fetchData();
    }
  }, [currentTenantId, currentDate, viewMode]);

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);

    let start: Date, end: Date;
    if (viewMode === 'month') {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    } else {
      start = startOfWeek(currentDate, { weekStartsOn: 0 });
      end = endOfWeek(currentDate, { weekStartsOn: 0 });
    }

    const [shiftsRes, membersRes, sectorsRes, sectorMembershipsRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', format(start, 'yyyy-MM-dd'))
        .lte('shift_date', format(end, 'yyyy-MM-dd'))
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase
        .from('memberships')
        .select('user_id, profile:profiles!memberships_user_id_profiles_fkey(id, name)')
        .eq('tenant_id', currentTenantId)
        .eq('active', true),
      supabase
        .from('sectors')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .eq('active', true)
        .order('name'),
      supabase
        .from('sector_memberships')
        .select('id, sector_id, user_id')
        .eq('tenant_id', currentTenantId),
    ]);

    if (sectorsRes.data) {
      setSectors(sectorsRes.data as Sector[]);
    }

    if (sectorMembershipsRes.data) {
      setSectorMemberships(sectorMembershipsRes.data);
    }

    if (shiftsRes.data) {
      setShifts(shiftsRes.data);
      
      // Fetch assignments for these shifts
      if (shiftsRes.data.length > 0) {
        const shiftIds = shiftsRes.data.map(s => s.id);
        const { data: assignmentsData } = await supabase
          .from('shift_assignments')
          .select('id, shift_id, user_id, assigned_value, status, profile:profiles!shift_assignments_user_id_profiles_fkey(name)')
          .in('shift_id', shiftIds);
        
        if (assignmentsData) {
          setAssignments(assignmentsData as unknown as ShiftAssignment[]);
        }
      } else {
        setAssignments([]);
      }
    }

    if (membersRes.data) {
      setMembers(membersRes.data as unknown as Member[]);
    }

    setLoading(false);
  }

  // Get members that belong to a specific sector
  function getMembersForSector(sectorId: string): Member[] {
    const sectorUserIds = sectorMemberships
      .filter(sm => sm.sector_id === sectorId)
      .map(sm => sm.user_id);
    return members.filter(m => sectorUserIds.includes(m.user_id));
  }

  // Check if shift is nocturnal (starts at 18:00 or later, or ends at 07:00 or before)
  function isNightShift(startTime: string, endTime: string): boolean {
    const startHour = parseInt(startTime.split(':')[0], 10);
    const endHour = parseInt(endTime.split(':')[0], 10);
    // Night shift if starts at 18:00+ or ends at 07:00 or before
    return startHour >= 18 || endHour <= 7 || endHour < startHour;
  }

  // Generate automatic title based on time
  function generateShiftTitle(startTime: string, endTime: string): string {
    const isNight = isNightShift(startTime, endTime);
    return isNight ? 'Plantão Noturno' : 'Plantão Diurno';
  }

  // Get sector color
  function getSectorColor(sectorId: string | null, hospital: string): string {
    if (sectorId) {
      const sector = sectors.find(s => s.id === sectorId);
      if (sector?.color) return sector.color;
    }
    // Fallback colors based on hospital name
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
    const index = hospital.charCodeAt(0) % colors.length;
    return colors[index];
  }

  // Get sector name
  function getSectorName(sectorId: string | null, hospital: string): string {
    if (sectorId) {
      const sector = sectors.find(s => s.id === sectorId);
      if (sector) return sector.name;
    }
    return hospital;
  }

  // Filter shifts by sector
  const filteredShifts = filterSector === 'all' 
    ? shifts 
    : shifts.filter(s => s.sector_id === filterSector || s.hospital === filterSector);

  // Get shifts for a specific date
  function getShiftsForDate(date: Date) {
    return filteredShifts.filter(s => isSameDay(parseISO(s.shift_date), date));
  }

  // Get assignments for a shift
  function getAssignmentsForShift(shiftId: string) {
    return assignments.filter(a => a.shift_id === shiftId);
  }

  // Calendar navigation
  const days = viewMode === 'month' 
    ? eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      })
    : eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
      });

  // Get day of week for first day of month (0-6, Sunday-Saturday)
  const firstDayOfWeek = viewMode === 'month' ? startOfMonth(currentDate).getDay() : 0;

  // Create empty cells for days before the first day of month
  const emptyCells = Array(firstDayOfWeek).fill(null);

  // Navigation handlers
  function navigatePrev() {
    if (viewMode === 'month') {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(subWeeks(currentDate, 1));
    }
  }

  function navigateNext() {
    if (viewMode === 'month') {
      setCurrentDate(addMonths(currentDate, 1));
    } else {
      setCurrentDate(addWeeks(currentDate, 1));
    }
  }

  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTenantId) return;

    // Generate title automatically based on time and assignment type
    let autoTitle = generateShiftTitle(formData.start_time, formData.end_time);
    
    // Add status to notes for tracking
    let shiftNotes = formData.notes || '';
    if (formData.assigned_user_id === 'disponivel') {
      shiftNotes = `[DISPONÍVEL] ${shiftNotes}`.trim();
    } else if (formData.assigned_user_id === 'vago') {
      shiftNotes = `[VAGO] ${shiftNotes}`.trim();
    }

    const shiftData = {
      tenant_id: currentTenantId,
      title: autoTitle,
      hospital: formData.hospital,
      location: formData.location || null,
      shift_date: formData.shift_date,
      start_time: formData.start_time,
      end_time: formData.end_time,
      base_value: parseFloat(formData.base_value) || 0,
      notes: shiftNotes || null,
      sector_id: formData.sector_id || null,
      created_by: user?.id,
      updated_by: user?.id,
    };

    if (editingShift) {
      const { error } = await supabase
        .from('shifts')
        .update(shiftData)
        .eq('id', editingShift.id);

      if (error) {
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Plantão atualizado!' });
        fetchData();
        closeShiftDialog();
      }
    } else {
      const { data: newShift, error } = await supabase
        .from('shifts')
        .insert(shiftData)
        .select()
        .single();

      if (error) {
        toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      } else {
        // If a real user was selected (not 'vago' or 'disponivel'), create the assignment
        if (formData.assigned_user_id && 
            formData.assigned_user_id !== 'vago' && 
            formData.assigned_user_id !== 'disponivel' && 
            newShift) {
          const { error: assignError } = await supabase.from('shift_assignments').insert({
            tenant_id: currentTenantId,
            shift_id: newShift.id,
            user_id: formData.assigned_user_id,
            assigned_value: parseFloat(formData.base_value) || 0,
            created_by: user?.id,
          });

          if (assignError) {
            console.error('Error assigning user:', assignError);
          }
        }

        const statusMsg = formData.assigned_user_id === 'disponivel' 
          ? 'Plantão disponível criado! Plantonistas podem se oferecer.'
          : formData.assigned_user_id === 'vago'
          ? 'Plantão vago criado!'
          : 'Plantão criado!';
        
        toast({ title: statusMsg });
        fetchData();
        closeShiftDialog();
      }
    }
  }

  async function handleDeleteShift(id: string) {
    if (!confirm('Deseja excluir este plantão e todas as atribuições?')) return;

    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Plantão excluído!' });
      fetchData();
      setDayDialogOpen(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedShift || !currentTenantId) return;

    const { error } = await supabase.from('shift_assignments').insert({
      tenant_id: currentTenantId,
      shift_id: selectedShift.id,
      user_id: assignData.user_id,
      assigned_value: parseFloat(assignData.assigned_value) || selectedShift.base_value,
      created_by: user?.id,
    });

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Erro', description: 'Usuário já atribuído a este plantão', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao atribuir', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Usuário atribuído!' });
      fetchData();
      setAssignDialogOpen(false);
      setAssignData({ user_id: '', assigned_value: '' });
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!confirm('Deseja remover este usuário do plantão?')) return;

    const { error } = await supabase.from('shift_assignments').delete().eq('id', assignmentId);
    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Usuário removido do plantão!' });
      fetchData();
    }
  }

  function openCreateShift(date?: Date, sectorIdOverride?: string) {
    // Use the override sector or the current filter if viewing a specific sector
    const effectiveSectorId = sectorIdOverride || (filterSector !== 'all' ? filterSector : sectors[0]?.id || '');
    const effectiveSector = sectors.find(s => s.id === effectiveSectorId);
    
    setEditingShift(null);
    setFormData({
      hospital: effectiveSector?.name || sectors[0]?.name || '',
      location: '',
      shift_date: date ? format(date, 'yyyy-MM-dd') : '',
      start_time: '07:00',
      end_time: '19:00',
      base_value: '',
      notes: '',
      sector_id: effectiveSectorId,
      assigned_user_id: '',
      duration_hours: '',
    });
    setShiftDialogOpen(true);
  }

  function openEditShift(shift: Shift) {
    setEditingShift(shift);
    setFormData({
      hospital: shift.hospital,
      location: shift.location || '',
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      base_value: shift.base_value.toString(),
      notes: shift.notes || '',
      sector_id: shift.sector_id || '',
      assigned_user_id: '',
      duration_hours: '',
    });
    setShiftDialogOpen(true);
  }

  function closeShiftDialog() {
    setShiftDialogOpen(false);
    setEditingShift(null);
    setFormData({
      hospital: '',
      location: '',
      shift_date: '',
      start_time: '',
      end_time: '',
      base_value: '',
      notes: '',
      sector_id: '',
      assigned_user_id: '',
      duration_hours: '',
    });
  }

  function openDayView(date: Date) {
    setSelectedDate(date);
    setDayDialogOpen(true);
  }

  function openAssignDialog(shift: Shift) {
    setSelectedShift(shift);
    setAssignData({ user_id: '', assigned_value: shift.base_value.toString() });
    setAssignDialogOpen(true);
  }

  // Render calendar grid for a given set of shifts
  function renderCalendarGrid(shiftsToRender: Shift[]) {
    function getShiftsForDateFiltered(date: Date) {
      return shiftsToRender.filter(s => isSameDay(parseISO(s.shift_date), date));
    }

    return (
      <>
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
            <div key={`empty-${index}`} className={viewMode === 'week' ? 'min-h-[200px]' : 'min-h-[120px]'} />
          ))}
          
          {days.map(day => {
            const dayShifts = getShiftsForDateFiltered(day);
            const hasShifts = dayShifts.length > 0;
            
            return (
              <div
                key={day.toISOString()}
                className={`${viewMode === 'week' ? 'min-h-[200px]' : 'min-h-[120px]'} p-1 border rounded-lg cursor-pointer transition-colors
                  ${isToday(day) ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'}
                `}
                onClick={() => openDayView(day)}
              >
                <div className={`text-sm font-medium mb-1 ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                  {format(day, 'd')}
                  {viewMode === 'week' && (
                    <span className="text-muted-foreground ml-1 text-xs">
                      {format(day, 'EEE', { locale: ptBR })}
                    </span>
                  )}
                </div>
                
                {hasShifts && (
                  <div className="space-y-1">
                    {dayShifts.slice(0, viewMode === 'week' ? 6 : 3).map(shift => {
                      const shiftAssignments = getAssignmentsForShift(shift.id);
                      const sectorColor = getSectorColor(shift.sector_id, shift.hospital);
                      const sectorName = getSectorName(shift.sector_id, shift.hospital);
                      const isNight = isNightShift(shift.start_time, shift.end_time);
                      
                      return (
                        <div
                          key={shift.id}
                          className={`text-xs p-1.5 rounded ${isNight ? 'ring-1 ring-indigo-400/30' : ''}`}
                          style={{ 
                            backgroundColor: isNight ? '#e0e7ff' : `${sectorColor}20`,
                            borderLeft: `3px solid ${isNight ? '#6366f1' : sectorColor}`
                          }}
                          title={`${shift.title} - ${sectorName} ${isNight ? '(Noturno)' : '(Diurno)'}`}
                        >
                          <div className="flex items-center gap-1">
                            {isNight ? (
                              <Moon className="h-3 w-3 text-indigo-600" />
                            ) : (
                              <Sun className="h-3 w-3 text-amber-500" />
                            )}
                            <span 
                              className="font-semibold truncate text-foreground" 
                            >
                              {sectorName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-2.5 w-2.5" />
                            {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                          </div>
                          {shiftAssignments.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {shiftAssignments.map(a => (
                                <div 
                                  key={a.id} 
                                  className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-background/80 text-foreground font-medium"
                                >
                                  <Users className="h-2.5 w-2.5 flex-shrink-0 text-primary" />
                                  <span className="truncate">{a.profile?.name || 'Sem nome'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {dayShifts.length > (viewMode === 'week' ? 6 : 3) && (
                      <div className="text-xs text-muted-foreground text-center">
                        +{dayShifts.length - (viewMode === 'week' ? 6 : 3)} mais
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // Print schedule function
  function handlePrintSchedule() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Erro', description: 'Não foi possível abrir a janela de impressão', variant: 'destructive' });
      return;
    }

    const activeSector = filterSector !== 'all' ? sectors.find(s => s.id === filterSector) : null;
    const scheduleName = activeSector ? activeSector.name : 'Todos os Setores';
    const periodLabel = viewMode === 'month' 
      ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
      : `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), "dd/MM", { locale: ptBR })} - ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), "dd/MM/yyyy", { locale: ptBR })}`;

    // Group shifts by date
    const shiftsByDate: Record<string, Shift[]> = {};
    filteredShifts.forEach(shift => {
      if (!shiftsByDate[shift.shift_date]) {
        shiftsByDate[shift.shift_date] = [];
      }
      shiftsByDate[shift.shift_date].push(shift);
    });

    // Sort dates
    const sortedDates = Object.keys(shiftsByDate).sort();

    let tableRows = '';
    sortedDates.forEach(dateStr => {
      const dayShifts = shiftsByDate[dateStr];
      const dateFormatted = format(parseISO(dateStr), "EEEE, dd/MM/yyyy", { locale: ptBR });
      
      dayShifts.forEach((shift, idx) => {
        const shiftAssignments = getAssignmentsForShift(shift.id);
        const sectorName = getSectorName(shift.sector_id, shift.hospital);
        const isNight = isNightShift(shift.start_time, shift.end_time);
        const shiftType = isNight ? '🌙 Noturno' : '☀️ Diurno';
        
        let assignedNames = '';
        if (shiftAssignments.length > 0) {
          assignedNames = shiftAssignments.map(a => a.profile?.name || 'Sem nome').join(', ');
        } else {
          // Check if it's marked as available or vacant in notes
          if (shift.notes?.includes('[DISPONÍVEL]')) {
            assignedNames = '<span style="color: #2563eb; font-weight: bold;">📋 DISPONÍVEL</span>';
          } else {
            assignedNames = '<span style="color: #dc2626; font-weight: bold;">⚠️ VAGO</span>';
          }
        }

        tableRows += `
          <tr>
            ${idx === 0 ? `<td rowspan="${dayShifts.length}" style="vertical-align: top; font-weight: 600; border: 1px solid #ddd; padding: 8px; background: #f8f9fa;">${dateFormatted}</td>` : ''}
            <td style="border: 1px solid #ddd; padding: 8px;">${sectorName}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${shiftType}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${assignedNames}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">R$ ${Number(shift.base_value).toFixed(2)}</td>
          </tr>
        `;
      });
    });

    // Calculate stats
    const vacantShifts = filteredShifts.filter(s => {
      const hasAssignment = getAssignmentsForShift(s.id).length > 0;
      return !hasAssignment && !s.notes?.includes('[DISPONÍVEL]');
    }).length;
    const availableShifts = filteredShifts.filter(s => s.notes?.includes('[DISPONÍVEL]')).length;
    const assignedShifts = filteredShifts.filter(s => getAssignmentsForShift(s.id).length > 0).length;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Escala - ${scheduleName} - ${periodLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { margin-bottom: 5px; color: #1a1a1a; }
          h2 { color: #666; font-weight: normal; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #1a1a1a; color: white; padding: 10px; text-align: left; }
          .stats { display: flex; gap: 20px; margin: 20px 0; }
          .stat-card { padding: 15px; background: #f5f5f5; border-radius: 8px; text-align: center; }
          .stat-number { font-size: 24px; font-weight: bold; }
          .stat-label { font-size: 12px; color: #666; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #999; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Escala de Plantões - ${scheduleName}</h1>
        <h2>${periodLabel}</h2>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stat-number">${filteredShifts.length}</div>
            <div class="stat-label">Total de Plantões</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #22c55e;">${assignedShifts}</div>
            <div class="stat-label">Preenchidos</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #2563eb;">${availableShifts}</div>
            <div class="stat-label">Disponíveis</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #dc2626;">${vacantShifts}</div>
            <div class="stat-label">Vagos</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Setor</th>
              <th>Horário</th>
              <th>Tipo</th>
              <th>Plantonista(s)</th>
              <th style="text-align: right;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #999;">Nenhum plantão no período</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  // Stats
  const totalShifts = filteredShifts.length;
  const totalAssignments = assignments.length;
  const uniqueWorkers = [...new Set(assignments.map(a => a.user_id))].length;

  if (loading) {
    return <div className="text-muted-foreground p-4">Carregando calendário...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalShifts}</p>
                <p className="text-xs text-muted-foreground">Plantões</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalAssignments}</p>
                <p className="text-xs text-muted-foreground">Atribuições</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{uniqueWorkers}</p>
                <p className="text-xs text-muted-foreground">Plantonistas Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{sectors.length}</p>
                <p className="text-xs text-muted-foreground">Setores</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Layout: Vertical Sector Sidebar + Calendar */}
      <div className="flex gap-4">
        {/* Vertical Sector Sidebar */}
        <div className="w-16 md:w-48 flex-shrink-0">
          <Card className="sticky top-4">
            <CardContent className="p-2">
              <div className="flex flex-col gap-1">
                {/* All Sectors Button */}
                <Button
                  variant={filterSector === 'all' ? 'default' : 'ghost'}
                  className={`w-full justify-start gap-2 h-auto py-3 ${filterSector === 'all' ? '' : 'hover:bg-accent'}`}
                  onClick={() => setFilterSector('all')}
                >
                  <LayoutGrid className="h-5 w-5 flex-shrink-0" />
                  <span className="hidden md:inline truncate">Todos</span>
                </Button>

                <div className="my-2 border-t" />

                {/* Sector Buttons */}
                {sectors.map(sector => {
                  const sectorShifts = shifts.filter(s => s.sector_id === sector.id);
                  const isActive = filterSector === sector.id;
                  
                  return (
                    <Button
                      key={sector.id}
                      variant={isActive ? 'secondary' : 'ghost'}
                      className={`w-full justify-start gap-2 h-auto py-3 ${isActive ? '' : 'hover:bg-accent'}`}
                      style={isActive ? { 
                        backgroundColor: `${sector.color || '#22c55e'}20`,
                        borderLeft: `3px solid ${sector.color || '#22c55e'}`
                      } : {}}
                      onClick={() => setFilterSector(sector.id)}
                    >
                      <span 
                        className="w-4 h-4 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: sector.color || '#22c55e' }}
                      />
                      <span className="hidden md:flex flex-col items-start truncate">
                        <span className="truncate text-sm">{sector.name}</span>
                        <span className="text-[10px] text-muted-foreground">{sectorShifts.length} plantões</span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendar Area */}
        <div className="flex-1 min-w-0">
          {/* Header Controls */}
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Navigation */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={navigatePrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-lg font-bold min-w-[180px] text-center">
                  {viewMode === 'month' 
                    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
                    : `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), "dd/MM", { locale: ptBR })} - ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), "dd/MM/yyyy", { locale: ptBR })}`
                  }
                </h2>
                <Button variant="outline" size="icon" onClick={navigateNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* View Mode Toggle */}
                <div className="flex border rounded-lg overflow-hidden">
                  <Button 
                    variant={viewMode === 'week' ? 'default' : 'ghost'} 
                    size="sm"
                    onClick={() => setViewMode('week')}
                    className="rounded-none"
                  >
                    Semana
                  </Button>
                  <Button 
                    variant={viewMode === 'month' ? 'default' : 'ghost'} 
                    size="sm"
                    onClick={() => setViewMode('month')}
                    className="rounded-none"
                  >
                    Mês
                  </Button>
                </div>

                <Button variant="outline" onClick={handlePrintSchedule}>
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </Button>

                <Button onClick={() => openCreateShift()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Plantão
                </Button>
              </div>
            </div>
          </div>

          {/* Calendar Content */}
          {filterSector === 'all' ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5" />
                  Todos os Setores
                  <Badge variant="secondary" className="ml-2">{shifts.length} plantões</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4">
                {renderCalendarGrid(shifts)}
              </CardContent>
            </Card>
          ) : (
            (() => {
              const sector = sectors.find(s => s.id === filterSector);
              const sectorShifts = shifts.filter(s => s.sector_id === filterSector);
              const sectorAssignments = assignments.filter(a => sectorShifts.some(s => s.id === a.shift_id));
              
              if (!sector) return null;
              
              return (
                <Card style={{ borderColor: sector.color || '#22c55e', borderWidth: '2px' }}>
                  <CardHeader className="pb-2" style={{ backgroundColor: `${sector.color || '#22c55e'}10` }}>
                    <CardTitle className="text-lg flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-5 h-5 rounded-full" 
                          style={{ backgroundColor: sector.color || '#22c55e' }}
                        />
                        {sector.name}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-normal">
                        <Badge variant="outline">{sectorShifts.length} plantões</Badge>
                        <Badge variant="outline">{sectorAssignments.length} atribuições</Badge>
                        <Badge variant="outline">{[...new Set(sectorAssignments.map(a => a.user_id))].length} plantonistas</Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    {renderCalendarGrid(sectorShifts)}
                  </CardContent>
                </Card>
              );
            })()
          )}
        </div>
      </div>

      {/* Day Detail Dialog */}
      <Dialog open={dayDialogOpen} onOpenChange={setDayDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                {selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </span>
              <Button size="sm" onClick={() => selectedDate && openCreateShift(selectedDate)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Plantão
              </Button>
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
                const sectorColor = getSectorColor(shift.sector_id, shift.hospital);
                const sectorName = getSectorName(shift.sector_id, shift.hospital);
                
                return (
                  <Card 
                    key={shift.id}
                    style={{ borderLeft: `4px solid ${sectorColor}` }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge 
                              variant="outline"
                              style={{ 
                                borderColor: sectorColor,
                                backgroundColor: `${sectorColor}20`
                              }}
                            >
                              {sectorName}
                            </Badge>
                          </div>
                          <CardTitle className="text-lg">{shift.title}</CardTitle>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
                            {shift.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {shift.location}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                            </span>
                            <span className="font-medium text-foreground">
                              R$ {Number(shift.base_value).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openAssignDialog(shift)}>
                            <UserPlus className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditShift(shift)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteShift(shift.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">Plantonistas Atribuídos:</div>
                          <Badge variant="secondary">{shiftAssignments.length} pessoa(s)</Badge>
                        </div>
                        {shiftAssignments.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">Nenhum plantonista atribuído</p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {shiftAssignments.map(assignment => (
                              <div 
                                key={assignment.id} 
                                className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border"
                              >
                                <div>
                                  <div className="font-medium text-sm">
                                    {assignment.profile?.name || 'Sem nome'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Valor: R$ {Number(assignment.assigned_value).toFixed(2)}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveAssignment(assignment.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            ))}
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

      {/* Create/Edit Shift Dialog */}
      <Dialog open={shiftDialogOpen} onOpenChange={(open) => !open && closeShiftDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Editar Plantão' : 'Novo Plantão'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateShift} className="space-y-4">
            {/* Show sector selector only if viewing "all" or editing */}
            {(filterSector === 'all' || editingShift) ? (
              <div className="space-y-2">
                <Label htmlFor="sector_id">Setor</Label>
                <Select 
                  value={formData.sector_id} 
                  onValueChange={(v) => {
                    const sector = sectors.find(s => s.id === v);
                    setFormData({ 
                      ...formData, 
                      sector_id: v, 
                      hospital: sector?.name || formData.hospital 
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um setor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectors.map(sector => (
                      <SelectItem key={sector.id} value={sector.id}>
                        <span className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: sector.color || '#22c55e' }}
                          />
                          {sector.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // Show selected sector as a badge when viewing specific sector
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                <span 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: sectors.find(s => s.id === formData.sector_id)?.color || '#22c55e' }}
                />
                <span className="font-medium">{sectors.find(s => s.id === formData.sector_id)?.name}</span>
                <span className="text-xs text-muted-foreground">(setor selecionado)</span>
              </div>
            )}
            {/* Auto-detected shift type indicator */}
            {formData.start_time && formData.end_time && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                {isNightShift(formData.start_time, formData.end_time) ? (
                  <>
                    <Moon className="h-5 w-5 text-indigo-400" />
                    <span className="font-medium text-indigo-400">Plantão Noturno</span>
                    <span className="text-xs text-muted-foreground">(detectado automaticamente)</span>
                  </>
                ) : (
                  <>
                    <Sun className="h-5 w-5 text-amber-500" />
                    <span className="font-medium text-amber-500">Plantão Diurno</span>
                    <span className="text-xs text-muted-foreground">(detectado automaticamente)</span>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="location">Local/Sala (opcional)</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Ex: Sala 3"
              />
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shift_date">Data</Label>
                <Input
                  id="shift_date"
                  type="date"
                  value={formData.shift_date}
                  onChange={(e) => setFormData({ ...formData, shift_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_time">Início</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Duração Rápida</Label>
                <Select 
                  value={formData.duration_hours} 
                  onValueChange={(v) => {
                    if (!formData.start_time) return;
                    const hours = parseInt(v, 10);
                    const [h, m] = formData.start_time.split(':').map(Number);
                    const startMinutes = h * 60 + m;
                    const endMinutes = (startMinutes + hours * 60) % (24 * 60);
                    const endH = Math.floor(endMinutes / 60).toString().padStart(2, '0');
                    const endM = (endMinutes % 60).toString().padStart(2, '0');
                    setFormData({ ...formData, end_time: `${endH}:${endM}`, duration_hours: v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 horas</SelectItem>
                    <SelectItem value="12">12 horas</SelectItem>
                    <SelectItem value="24">24 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom_duration">Duração (horas)</Label>
                <Input
                  id="custom_duration"
                  type="number"
                  min="1"
                  max="48"
                  placeholder="Ex: 8"
                  value={formData.duration_hours}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, duration_hours: value });
                    
                    if (!formData.start_time || !value) return;
                    const hours = parseInt(value, 10);
                    if (isNaN(hours) || hours < 1) return;
                    const [h, m] = formData.start_time.split(':').map(Number);
                    const startMinutes = h * 60 + m;
                    const endMinutes = (startMinutes + hours * 60) % (24 * 60);
                    const endH = Math.floor(endMinutes / 60).toString().padStart(2, '0');
                    const endM = (endMinutes % 60).toString().padStart(2, '0');
                    setFormData(prev => ({ ...prev, end_time: `${endH}:${endM}`, duration_hours: value }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">Término</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="base_value">Valor Base (R$) - opcional</Label>
                <Input
                  id="base_value"
                  type="number"
                  step="0.01"
                  value={formData.base_value}
                  onChange={(e) => setFormData({ ...formData, base_value: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              
              {/* Plantonista selection - only for new shifts */}
              {!editingShift && (
                <div className="space-y-2">
                  <Label>Atribuição do Plantão</Label>
                  <Select 
                    value={formData.assigned_user_id || 'vago'} 
                    onValueChange={(v) => setFormData({ ...formData, assigned_user_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vago">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gray-400" />
                          Plantão Vago
                        </span>
                      </SelectItem>
                      <SelectItem value="disponivel">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Plantão Disponível (usuários podem se oferecer)
                        </span>
                      </SelectItem>
                      {/* Show only members that belong to the selected sector */}
                      {formData.sector_id && getMembersForSector(formData.sector_id).length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                            Plantonistas do Setor
                          </div>
                          {getMembersForSector(formData.sector_id).map((m) => (
                            <SelectItem key={m.user_id} value={m.user_id}>
                              <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary" />
                                {m.profile?.name || 'Sem nome'}
                              </span>
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {formData.sector_id && getMembersForSector(formData.sector_id).length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
                          Nenhum plantonista vinculado a este setor
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  {formData.assigned_user_id === 'disponivel' && (
                    <p className="text-xs text-muted-foreground">
                      Este plantão ficará visível para plantonistas se oferecerem. Você precisará aprovar.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observações adicionais..."
              />
            </div>
            <Button type="submit" className="w-full">
              {editingShift ? 'Salvar Alterações' : 'Criar Plantão'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign User Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Plantonista</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4">
            <div className="space-y-2">
              <Label>Plantonista</Label>
              <Select value={assignData.user_id} onValueChange={(v) => setAssignData({ ...assignData, user_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plantonista" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.name || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_value">Valor Atribuído (R$)</Label>
              <Input
                id="assigned_value"
                type="number"
                step="0.01"
                value={assignData.assigned_value}
                onChange={(e) => setAssignData({ ...assignData, assigned_value: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={!assignData.user_id}>
              Atribuir Plantonista
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
