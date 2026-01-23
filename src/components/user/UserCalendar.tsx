import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Filter, Moon, Sun, CalendarPlus } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, getDay, startOfWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseDateOnly } from '@/lib/utils';
import { generateICSFile, shareICSFile } from '@/lib/calendarExport';

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

type FilterTab = 'todos' | 'meus';

export default function UserCalendar() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [mySectors, setMySectors] = useState<MySector[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');

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
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    const [mySectorsRes, shiftsRes, rosterRes] = await Promise.all([
      supabase
        .from('sector_memberships')
        .select('sector_id, sector:sectors(*)')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id),
      supabase
        .from('shifts')
        .select('*, sector:sectors(*)')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', startStr)
        .lte('shift_date', endStr)
        .order('shift_date', { ascending: true }),
      // Use RPC to get roster with names (avoids RLS issues on mobile)
      supabase.rpc('get_shift_roster', {
        _tenant_id: currentTenantId,
        _start: startStr,
        _end: endStr,
      }),
    ]);

    if (rosterRes.error) {
      console.error('get_shift_roster error:', rosterRes.error);
      toast({
        title: 'Não foi possível carregar os nomes',
        description: 'Verifique sua conexão e tente novamente.',
        variant: 'destructive',
      });
    }
    const rosterMap = new Map<string, { user_id: string; status: string; name: string | null }[]>();
    if (rosterRes.data) {
      (rosterRes.data as { shift_id: string; user_id: string; status: string; name: string | null }[]).forEach(r => {
        if (!rosterMap.has(r.shift_id)) {
          rosterMap.set(r.shift_id, []);
        }
        rosterMap.get(r.shift_id)!.push({ user_id: r.user_id, status: r.status, name: r.name });
      });
    }

    if (mySectorsRes.data) {
      setMySectors(mySectorsRes.data as unknown as MySector[]);
    }

    if (shiftsRes.data) {
      setShifts(shiftsRes.data as unknown as Shift[]);

      // Build assignments from roster data
      const enrichedAssignments: ShiftAssignment[] = [];
      rosterMap.forEach((roster, shiftId) => {
        roster.forEach((r, idx) => {
          enrichedAssignments.push({
            id: `${shiftId}-${idx}`,
            shift_id: shiftId,
            user_id: r.user_id,
            assigned_value: 0, // Not needed for display
            status: r.status,
            profile: { name: r.name },
          });
        });
      });
      setAssignments(enrichedAssignments);
    }

    setLoading(false);
  }

  // Filter shifts
  const mySectorIds = mySectors.map(ms => ms.sector_id);

  function getShiftsForDate(date: Date) {
    return shifts.filter(s => isSameDay(parseDateOnly(s.shift_date), date));
  }

  function getAssignmentsForShift(shiftId: string) {
    return assignments.filter(a => a.shift_id === shiftId);
  }

  function isMyShift(shiftId: string) {
    return assignments.some(a => a.shift_id === shiftId && a.user_id === user?.id);
  }

  function hasShiftsOnDate(date: Date) {
    const dayShifts = getShiftsForDate(date);
    if (activeTab === 'meus') {
      return dayShifts.some(s => isMyShift(s.id));
    }
    return dayShifts.length > 0;
  }

  // Calculate hours
  function calculateHours(start: string, end: string) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let hours = eh - sh;
    if (hours < 0) hours += 24;
    return `${hours}h${em > 0 ? em.toString().padStart(2, '0') : '00'}`;
  }

  // Check if shift is nocturnal (starts at 18:00 or later, or before 06:00)
  function isNightShift(startTime: string) {
    const [hour] = startTime.split(':').map(Number);
    return hour >= 18 || hour < 6;
  }

  // Calendar setup
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  
  const days: Date[] = [];
  let day = calendarStart;
  while (days.length < 42) { // 6 weeks max
    days.push(day);
    day = addDays(day, 1);
  }

  // Get shifts for selected date
  const selectedDateShifts = getShiftsForDate(selectedDate);
  
  // For "Meus Plantões" tab, show ALL user's shifts for the month
  const myMonthShifts = shifts.filter(s => isMyShift(s.id));
  
  const filteredShifts = activeTab === 'meus'
    ? myMonthShifts // Show all month's shifts when in "Meus Plantões"
    : selectedDateShifts; // Show only selected date when in "Todos"

  // Group shifts by sector first, then by date, then by period within each sector
  const groupBySectorWithDates = (list: Shift[]) => {
    const groups: Record<string, { 
      sector: Sector | null; 
      shiftsByDate: Record<string, { dayShifts: Shift[]; nightShifts: Shift[] }>;
    }> = {};
    
    list.forEach(shift => {
      const sectorId = shift.sector?.id || 'no-sector';
      const dateKey = shift.shift_date;
      
      if (!groups[sectorId]) {
        groups[sectorId] = {
          sector: shift.sector || null,
          shiftsByDate: {},
        };
      }
      
      if (!groups[sectorId].shiftsByDate[dateKey]) {
        groups[sectorId].shiftsByDate[dateKey] = {
          dayShifts: [],
          nightShifts: [],
        };
      }
      
      if (isNightShift(shift.start_time)) {
        groups[sectorId].shiftsByDate[dateKey].nightShifts.push(shift);
      } else {
        groups[sectorId].shiftsByDate[dateKey].dayShifts.push(shift);
      }
    });
    
    // Sort shifts within each group by start time
    Object.values(groups).forEach(group => {
      Object.values(group.shiftsByDate).forEach(dateGroup => {
        dateGroup.dayShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
        dateGroup.nightShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
      });
    });
    
    return groups;
  };

  // Legacy grouping for "Todos" tab (single date)
  const groupBySector = (list: Shift[]) => {
    const groups: Record<string, { sector: Sector | null; dayShifts: Shift[]; nightShifts: Shift[] }> = {};
    
    list.forEach(shift => {
      const sectorId = shift.sector?.id || 'no-sector';
      if (!groups[sectorId]) {
        groups[sectorId] = {
          sector: shift.sector || null,
          dayShifts: [],
          nightShifts: [],
        };
      }
      
      if (isNightShift(shift.start_time)) {
        groups[sectorId].nightShifts.push(shift);
      } else {
        groups[sectorId].dayShifts.push(shift);
      }
    });
    
    // Sort shifts within each group by start time
    Object.values(groups).forEach(group => {
      group.dayShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
      group.nightShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
    });
    
    return groups;
  };

  const groupedBySector = groupBySector(selectedDateShifts.filter(s => activeTab === 'todos' || isMyShift(s.id)));
  const groupedBySectorWithDates = groupBySectorWithDates(myMonthShifts);
  const hasAnyShiftsForSelectedDate = activeTab === 'meus' ? myMonthShifts.length > 0 : selectedDateShifts.length > 0;

  // Export to calendar function
  async function handleExportToCalendar() {
    if (myMonthShifts.length === 0) {
      toast({
        title: 'Sem plantões para exportar',
        description: 'Você não tem plantões neste mês.',
        variant: 'destructive',
      });
      return;
    }

    const eventsToExport = myMonthShifts.map(shift => ({
      id: shift.id,
      title: shift.title,
      hospital: shift.hospital,
      location: shift.location,
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      sector_name: shift.sector?.name,
    }));

    const monthName = format(currentDate, 'MMMM-yyyy', { locale: ptBR });
    const icsContent = generateICSFile(eventsToExport, `Plantões ${monthName}`);
    const filename = `plantoes-${monthName}.ics`;
    
    await shareICSFile(icsContent, filename);
    
    toast({
      title: 'Plantões exportados!',
      description: 'O arquivo foi gerado. Abra-o para adicionar ao seu calendário.',
    });
  }

  const weekDays = ['seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.'];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Calendar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8" 
          onClick={handleExportToCalendar}
          title="Exportar para Calendário"
        >
          <CalendarPlus className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-medium text-foreground">
          {format(currentDate, 'MMMM', { locale: ptBR })}
        </h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 border-b bg-card">
        {weekDays.map((day, i) => (
          <div 
            key={day} 
            className={cn(
              "py-2 text-center text-xs font-medium",
              i === 3 ? "text-primary" : "text-muted-foreground" // Thursday highlighted like in screenshot
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 flex-1">
        {days.map((date, index) => {
          const isCurrentMonth = date.getMonth() === currentDate.getMonth();
          const isSelected = isSameDay(date, selectedDate);
          const isTodayDate = isToday(date);
          const hasShifts = hasShiftsOnDate(date);
          const hasMyShiftToday = getShiftsForDate(date).some(s => isMyShift(s.id));

          return (
            <button
              key={index}
              onClick={() => setSelectedDate(date)}
              className={cn(
                "relative flex flex-col items-center justify-center py-3 border-b border-r border-border/30 transition-colors",
                !isCurrentMonth && "opacity-40",
                isSelected && "bg-primary text-primary-foreground",
                !isSelected && isTodayDate && "bg-accent",
                !isSelected && "hover:bg-accent/50"
              )}
            >
              <span className={cn(
                "text-sm font-medium",
                isSelected ? "text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"
              )}>
                {format(date, 'd')}
              </span>
              
              {/* Indicator dots */}
              {hasShifts && (
                <div className="absolute bottom-1 flex gap-0.5">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isSelected ? "bg-primary-foreground" : hasMyShiftToday ? "bg-primary" : "bg-primary/60"
                  )} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Expandable Panel */}
      <div className={cn(
        "bg-card border-t transition-all duration-300",
        panelExpanded ? "flex-1 min-h-[40vh]" : "h-auto"
      )}>
        {/* Panel Toggle */}
        <button 
          onClick={() => setPanelExpanded(!panelExpanded)}
          className="w-full flex justify-center py-2 border-b"
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </button>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('todos')}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-colors",
              activeTab === 'todos' 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            Todos
          </button>
          <button
            onClick={() => setActiveTab('meus')}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-colors border-l border-r",
              activeTab === 'meus' 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            Meus Plantões
          </button>
        </div>

        {/* Shifts List */}
        {panelExpanded && (
          <div className="flex-1 overflow-auto">
            {!hasAnyShiftsForSelectedDate ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {activeTab === 'meus' 
                  ? `Nenhum plantão seu em ${format(currentDate, 'MMMM', { locale: ptBR })}`
                  : `Nenhum plantão para ${format(selectedDate, "d 'de' MMMM", { locale: ptBR })}`
                }
              </div>
            ) : activeTab === 'meus' ? (
              /* View for "Meus Plantões" - All month shifts grouped by sector and date */
              <div>
                {Object.entries(groupedBySectorWithDates).map(([sectorId, { sector, shiftsByDate }]) => (
                  <div key={sectorId} className="border-b last:border-b-0">
                    {/* Sector Header */}
                    <div 
                      className="px-4 py-3 border-b sticky top-0 z-10"
                      style={{ 
                        backgroundColor: sector?.color ? `${sector.color}20` : 'hsl(var(--muted))',
                        borderLeftWidth: '4px',
                        borderLeftColor: sector?.color || 'hsl(var(--muted-foreground))',
                      }}
                    >
                      <span className="text-sm font-bold text-foreground uppercase tracking-wide">
                        {sector?.name || 'Sem Setor'}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({Object.values(shiftsByDate).reduce((acc, d) => acc + d.dayShifts.length + d.nightShifts.length, 0)} plantões)
                      </span>
                    </div>

                    {/* Shifts grouped by date */}
                    {Object.entries(shiftsByDate)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([dateKey, { dayShifts, nightShifts }]) => (
                        <div key={dateKey} className="border-b last:border-b-0">
                          {/* Date Header */}
                          <div className="px-4 py-2 bg-muted/30 border-b">
                            <span className="text-xs font-semibold text-foreground">
                              {format(parseDateOnly(dateKey), "EEEE, d 'de' MMMM", { locale: ptBR })}
                            </span>
                          </div>

                          {/* Day shifts */}
                          {dayShifts.map((shift) => {
                            const shiftAssignments = getAssignmentsForShift(shift.id);
                            return (
                              <div
                                key={shift.id}
                                className="flex items-center gap-3 px-4 py-3 border-b transition-colors border-l-2 bg-warning/5 hover:bg-warning/10 border-l-warning"
                              >
                                <div className="flex -space-x-2">
                                  {shiftAssignments.slice(0, 2).map((assignment) => (
                                    <Avatar
                                      key={assignment.id}
                                      className={cn(
                                        "h-8 w-8 border-2",
                                        assignment.user_id === user?.id ? "border-primary" : "border-card"
                                      )}
                                    >
                                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                        {assignment.profile?.name?.slice(0, 2).toUpperCase() || 'U'}
                                      </AvatarFallback>
                                    </Avatar>
                                  ))}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Sun className="h-3.5 w-3.5 text-warning" />
                                    <span className="text-sm font-medium text-foreground">
                                      {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-warning/15 text-warning">
                                      Diurno
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {shift.hospital} {shift.location && `• ${shift.location}`}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {calculateHours(shift.start_time, shift.end_time)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}

                          {/* Night shifts */}
                          {nightShifts.map((shift) => {
                            const shiftAssignments = getAssignmentsForShift(shift.id);
                            return (
                              <div
                                key={shift.id}
                                className="flex items-center gap-3 px-4 py-3 border-b transition-colors border-l-2 bg-info/5 hover:bg-info/10 border-l-info"
                              >
                                <div className="flex -space-x-2">
                                  {shiftAssignments.slice(0, 2).map((assignment) => (
                                    <Avatar
                                      key={assignment.id}
                                      className={cn(
                                        "h-8 w-8 border-2",
                                        assignment.user_id === user?.id ? "border-primary" : "border-card"
                                      )}
                                    >
                                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                        {assignment.profile?.name?.slice(0, 2).toUpperCase() || 'U'}
                                      </AvatarFallback>
                                    </Avatar>
                                  ))}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Moon className="h-3.5 w-3.5 text-info" />
                                    <span className="text-sm font-medium text-foreground">
                                      {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-info/15 text-info">
                                      Noturno
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {shift.hospital} {shift.location && `• ${shift.location}`}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {calculateHours(shift.start_time, shift.end_time)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            ) : (
              /* View for "Todos" - Single date shifts */
              <div>
                {Object.entries(groupedBySector).map(([sectorId, { sector, dayShifts, nightShifts }]) => (
                  <div key={sectorId} className="border-b last:border-b-0">
                    {/* Sector Header */}
                    <div 
                      className="px-4 py-2 border-b"
                      style={{ 
                        backgroundColor: sector?.color ? `${sector.color}15` : 'hsl(var(--muted))',
                        borderLeftWidth: '4px',
                        borderLeftColor: sector?.color || 'hsl(var(--muted-foreground))',
                      }}
                    >
                      <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                        {sector?.name || 'Sem Setor'}
                      </span>
                    </div>

                    {/* Day shifts for this sector */}
                    {dayShifts.length > 0 && (
                      <div>
                        <div className="px-4 py-1.5 bg-warning/10 border-b">
                          <div className="flex items-center gap-2">
                            <Sun className="h-3.5 w-3.5 text-warning" />
                            <span className="text-xs font-medium text-warning">Diurnos ({dayShifts.length})</span>
                          </div>
                        </div>

                        {dayShifts.map((shift) => {
                          const shiftAssignments = getAssignmentsForShift(shift.id);
                          const isMine = isMyShift(shift.id);

                          return (
                            <div
                              key={shift.id}
                              className={cn(
                                "flex items-center gap-3 px-4 py-3 border-b transition-colors border-l-2",
                                "bg-warning/5 hover:bg-warning/10 border-l-warning"
                              )}
                            >
                              <div className="flex -space-x-2">
                                {shiftAssignments.slice(0, 3).map((assignment) => (
                                  <Avatar
                                    key={assignment.id}
                                    className={cn(
                                      "h-10 w-10 border-2",
                                      isMine && assignment.user_id === user?.id ? "border-primary" : "border-card"
                                    )}
                                  >
                                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                      {assignment.profile?.name?.slice(0, 2).toUpperCase() || 'U'}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                                {shiftAssignments.length === 0 && (
                                  <Avatar className="h-10 w-10 border-2 border-card">
                                    <AvatarFallback className="bg-muted/50 text-muted-foreground text-xs">?</AvatarFallback>
                                  </Avatar>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Sun className="h-3.5 w-3.5 text-warning" />
                                  <span className="text-sm text-muted-foreground">{shift.start_time.slice(0, 5)}</span>
                                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-warning/15 text-warning">
                                    Diurno
                                  </span>
                                  <span className="font-medium text-foreground truncate">
                                    {shiftAssignments[0]?.profile?.name || shift.title}
                                  </span>
                                  {isMine && (
                                    <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">EU</span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {shift.end_time.slice(0, 5)} • {calculateHours(shift.start_time, shift.end_time)}
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-xs text-muted-foreground truncate max-w-[100px] block">{shift.hospital}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Night shifts for this sector */}
                    {nightShifts.length > 0 && (
                      <div>
                        <div className="px-4 py-1.5 bg-info/10 border-b">
                          <div className="flex items-center gap-2">
                            <Moon className="h-3.5 w-3.5 text-info" />
                            <span className="text-xs font-medium text-info">Noturnos ({nightShifts.length})</span>
                          </div>
                        </div>

                        {nightShifts.map((shift) => {
                          const shiftAssignments = getAssignmentsForShift(shift.id);
                          const isMine = isMyShift(shift.id);

                          return (
                            <div
                              key={shift.id}
                              className={cn(
                                "flex items-center gap-3 px-4 py-3 border-b transition-colors border-l-2",
                                "bg-info/5 hover:bg-info/10 border-l-info"
                              )}
                            >
                              <div className="flex -space-x-2">
                                {shiftAssignments.slice(0, 3).map((assignment) => (
                                  <Avatar
                                    key={assignment.id}
                                    className={cn(
                                      "h-10 w-10 border-2",
                                      isMine && assignment.user_id === user?.id ? "border-primary" : "border-card"
                                    )}
                                  >
                                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                      {assignment.profile?.name?.slice(0, 2).toUpperCase() || 'U'}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                                {shiftAssignments.length === 0 && (
                                  <Avatar className="h-10 w-10 border-2 border-card">
                                    <AvatarFallback className="bg-muted/50 text-muted-foreground text-xs">?</AvatarFallback>
                                  </Avatar>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Moon className="h-3.5 w-3.5 text-info" />
                                  <span className="text-sm text-info">{shift.start_time.slice(0, 5)}</span>
                                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-info/15 text-info">
                                    Noturno
                                  </span>
                                  <span className="font-medium text-foreground truncate">
                                    {shiftAssignments[0]?.profile?.name || shift.title}
                                  </span>
                                  {isMine && (
                                    <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">EU</span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {shift.end_time.slice(0, 5)} • {calculateHours(shift.start_time, shift.end_time)}
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-xs text-muted-foreground truncate max-w-[100px] block">{shift.hospital}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
