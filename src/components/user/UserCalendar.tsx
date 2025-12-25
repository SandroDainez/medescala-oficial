import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO, getDay, startOfWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

    const [mySectorsRes, shiftsRes] = await Promise.all([
      supabase
        .from('sector_memberships')
        .select('sector_id, sector:sectors(*)')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id),
      supabase
        .from('shifts')
        .select('*, sector:sectors(*)')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', format(start, 'yyyy-MM-dd'))
        .lte('shift_date', format(end, 'yyyy-MM-dd'))
        .order('shift_date', { ascending: true }),
    ]);

    if (mySectorsRes.data) {
      setMySectors(mySectorsRes.data as unknown as MySector[]);
    }

    if (shiftsRes.data) {
      setShifts(shiftsRes.data as unknown as Shift[]);

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

  // Filter shifts
  const mySectorIds = mySectors.map(ms => ms.sector_id);

  function getShiftsForDate(date: Date) {
    return shifts.filter(s => isSameDay(parseISO(s.shift_date), date));
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
  const filteredShifts = activeTab === 'meus' 
    ? selectedDateShifts.filter(s => isMyShift(s.id))
    : selectedDateShifts;

  // Group shifts by sector/hospital
  const groupedShifts = filteredShifts.reduce((acc, shift) => {
    const key = shift.sector?.name || shift.hospital;
    if (!acc[key]) acc[key] = [];
    acc[key].push(shift);
    return acc;
  }, {} as Record<string, Shift[]>);

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
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
          <Filter className="h-4 w-4" />
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
            {Object.keys(groupedShifts).length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                Nenhum plantão para {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
              </div>
            ) : (
              Object.entries(groupedShifts).map(([group, groupShifts]) => (
                <div key={group}>
                  {/* Group Header */}
                  <div className="px-4 py-2 bg-muted/50 border-b">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {group}
                    </span>
                  </div>

                  {/* Shifts in group */}
                  {groupShifts.map(shift => {
                    const shiftAssignments = getAssignmentsForShift(shift.id);
                    const isMine = isMyShift(shift.id);

                    return (
                      <div key={shift.id} className="flex items-center gap-3 px-4 py-3 border-b hover:bg-accent/30 transition-colors">
                        {/* Avatar stack or single */}
                        <div className="flex -space-x-2">
                          {shiftAssignments.slice(0, 3).map((assignment, idx) => (
                            <Avatar key={assignment.id} className={cn(
                              "h-10 w-10 border-2",
                              isMine && assignment.user_id === user?.id ? "border-primary" : "border-card"
                            )}>
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

                        {/* Shift info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {shift.start_time.slice(0, 5)}
                            </span>
                            <span className="font-medium text-foreground truncate">
                              {shiftAssignments[0]?.profile?.name || shift.title}
                            </span>
                            {isMine && (
                              <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
                                EU
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {shift.end_time.slice(0, 5)} • {calculateHours(shift.start_time, shift.end_time)}
                          </div>
                        </div>

                        {/* Hospital */}
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground truncate max-w-[100px] block">
                            {shift.hospital}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
