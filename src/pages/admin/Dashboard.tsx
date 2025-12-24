import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, Users, ArrowLeftRight, DollarSign, ChevronLeft, ChevronRight,
  Clock, MapPin, UserPlus, Trash2, Check, X as XIcon, Building2, Eye, Plus
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO, startOfWeek, endOfWeek, addDays } from 'date-fns';
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
  base_value: number;
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

interface SwapRequest {
  id: string;
  status: string;
  reason: string | null;
  created_at: string;
  requester: { name: string | null } | null;
  target_user: { name: string | null } | null;
  origin_assignment: { 
    shift: { title: string; shift_date: string; hospital: string } | null 
  } | null;
}

interface Member {
  id: string;
  user_id: string;
  role: 'admin' | 'user';
  active: boolean;
  profile: { name: string | null } | null;
}

interface FinancialSummary {
  user_id: string;
  user_name: string;
  total_shifts: number;
  total_value: number;
  sectors: string[];
}

export default function AdminDashboard() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  
  // Data
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [financialData, setFinancialData] = useState<FinancialSummary[]>([]);
  
  // Stats
  const [stats, setStats] = useState({
    totalShifts: 0,
    totalUsers: 0,
    pendingSwaps: 0,
    monthlyValue: 0,
  });

  useEffect(() => {
    if (currentTenantId) {
      fetchAllData();
    }
  }, [currentTenantId, currentDate]);

  async function fetchAllData() {
    if (!currentTenantId) return;
    setLoading(true);

    const start = viewMode === 'week' 
      ? startOfWeek(currentDate, { weekStartsOn: 0 })
      : startOfMonth(currentDate);
    const end = viewMode === 'week'
      ? endOfWeek(currentDate, { weekStartsOn: 0 })
      : endOfMonth(currentDate);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    const [shiftsRes, sectorsRes, membersRes, swapsRes, monthShiftsRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('*, sector:sectors(*)')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', format(start, 'yyyy-MM-dd'))
        .lte('shift_date', format(end, 'yyyy-MM-dd'))
        .order('shift_date'),
      supabase
        .from('sectors')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .eq('active', true),
      supabase
        .from('memberships')
        .select('id, user_id, role, active, profile:profiles!memberships_user_id_profiles_fkey(name)')
        .eq('tenant_id', currentTenantId),
      supabase
        .from('swap_requests')
        .select(`
          id, status, reason, created_at,
          requester:profiles!swap_requests_requester_id_profiles_fkey(name),
          target_user:profiles!swap_requests_target_user_id_profiles_fkey(name),
          origin_assignment:shift_assignments!swap_requests_origin_assignment_id_fkey(
            shift:shifts(title, shift_date, hospital)
          )
        `)
        .eq('tenant_id', currentTenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('shifts')
        .select('id')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('shift_date', format(monthEnd, 'yyyy-MM-dd')),
    ]);

    if (sectorsRes.data) setSectors(sectorsRes.data);
    if (membersRes.data) setMembers(membersRes.data as unknown as Member[]);
    if (swapsRes.data) setSwaps(swapsRes.data as unknown as SwapRequest[]);

    if (shiftsRes.data) {
      setShifts(shiftsRes.data as unknown as Shift[]);
      
      // Fetch assignments
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

    // Calculate financial data for the month
    const { data: monthAssignments } = await supabase
      .from('shift_assignments')
      .select(`
        user_id, assigned_value,
        profile:profiles!shift_assignments_user_id_profiles_fkey(name),
        shift:shifts!inner(shift_date, sector_id, sector:sectors(name))
      `)
      .eq('tenant_id', currentTenantId)
      .gte('shift.shift_date', format(monthStart, 'yyyy-MM-dd'))
      .lte('shift.shift_date', format(monthEnd, 'yyyy-MM-dd'));

    if (monthAssignments) {
      const summaryMap = new Map<string, FinancialSummary>();
      
      monthAssignments.forEach((a: any) => {
        const existing = summaryMap.get(a.user_id) || {
          user_id: a.user_id,
          user_name: a.profile?.name || 'Sem nome',
          total_shifts: 0,
          total_value: 0,
          sectors: [],
        };
        
        existing.total_shifts++;
        existing.total_value += Number(a.assigned_value || 0);
        
        const sectorName = a.shift?.sector?.name;
        if (sectorName && !existing.sectors.includes(sectorName)) {
          existing.sectors.push(sectorName);
        }
        
        summaryMap.set(a.user_id, existing);
      });
      
      setFinancialData(Array.from(summaryMap.values()).sort((a, b) => b.total_value - a.total_value));
    }

    // Calculate stats
    const totalMonthlyValue = financialData.reduce((sum, f) => sum + f.total_value, 0);
    
    setStats({
      totalShifts: monthShiftsRes.data?.length || 0,
      totalUsers: (membersRes.data || []).filter((m: any) => m.active).length,
      pendingSwaps: (swapsRes.data || []).length,
      monthlyValue: totalMonthlyValue,
    });

    setLoading(false);
  }

  // Get days for calendar
  const calendarDays = viewMode === 'week'
    ? eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
      })
    : eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      });

  function getShiftsForDate(date: Date) {
    return shifts.filter(s => isSameDay(parseISO(s.shift_date), date));
  }

  function getAssignmentsForShift(shiftId: string) {
    return assignments.filter(a => a.shift_id === shiftId);
  }

  async function handleSwapAction(swapId: string, action: 'approved' | 'rejected') {
    const { error } = await supabase
      .from('swap_requests')
      .update({ 
        status: action, 
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        updated_by: user?.id
      })
      .eq('id', swapId);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: action === 'approved' ? 'Troca aprovada!' : 'Troca rejeitada!' });
      fetchAllData();
    }
  }

  function openDayDetail(date: Date) {
    setSelectedDate(date);
    setDayDialogOpen(true);
  }

  // Navigation functions
  function navigatePrevious() {
    if (viewMode === 'week') {
      setCurrentDate(addDays(currentDate, -7));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  }

  function navigateNext() {
    if (viewMode === 'week') {
      setCurrentDate(addDays(currentDate, 7));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  }

  if (loading) {
    return <div className="text-muted-foreground p-4">Carregando dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dashboard Administrativo</h2>
          <p className="text-muted-foreground">Visão completa do hospital - {format(currentDate, 'MMMM yyyy', { locale: ptBR })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/admin/sectors')}>
            <Building2 className="mr-2 h-4 w-4" />
            Setores
          </Button>
          <Button variant="outline" onClick={() => navigate('/admin/users')}>
            <Users className="mr-2 h-4 w-4" />
            Usuários
          </Button>
          <Button onClick={() => navigate('/admin/calendar')}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Plantão
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => navigate('/admin/calendar')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Plantões do Mês</CardTitle>
            <Calendar className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalShifts}</div>
            <p className="text-xs text-muted-foreground">Ver calendário →</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => navigate('/admin/users')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Membros Ativos</CardTitle>
            <Users className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">Gerenciar →</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => navigate('/admin/swaps')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trocas Pendentes</CardTitle>
            <ArrowLeftRight className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingSwaps}</div>
            <p className="text-xs text-muted-foreground">{stats.pendingSwaps > 0 ? 'Ação necessária!' : 'Tudo em dia'}</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => navigate('/admin/financial')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Total do Mês</CardTitle>
            <DollarSign className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {financialData.reduce((sum, f) => sum + f.total_value, 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Ver detalhes →</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="calendar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar">
            <Calendar className="mr-2 h-4 w-4" />
            Plantões
          </TabsTrigger>
          <TabsTrigger value="swaps">
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Trocas ({swaps.length})
          </TabsTrigger>
          <TabsTrigger value="financial">
            <DollarSign className="mr-2 h-4 w-4" />
            Financeiro
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="mr-2 h-4 w-4" />
            Equipe
          </TabsTrigger>
        </TabsList>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-4">
          {/* Main Layout: Vertical Sector Sidebar + Calendar */}
          <div className="flex gap-4">
            {/* Vertical Sector Sidebar */}
            <div className="w-48 flex-shrink-0">
              <Card className="sticky top-4">
                <CardContent className="p-2">
                  <div className="flex flex-col gap-1">
                    {sectors.map(sector => {
                      const sectorShifts = shifts.filter(s => s.sector?.id === sector.id);
                      
                      return (
                        <Button
                          key={sector.id}
                          variant="ghost"
                          className="w-full justify-start gap-2 h-auto py-3 hover:bg-accent"
                          style={{ 
                            backgroundColor: `${sector.color}10`,
                            borderLeft: `3px solid ${sector.color}`
                          }}
                          onClick={() => navigate('/admin/calendar')}
                        >
                          <span 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: sector.color }}
                          />
                          <span className="flex flex-col items-start truncate">
                            <span className="truncate text-xs font-medium">{sector.name}</span>
                            <span className="text-[10px] text-muted-foreground">{sectorShifts.length} plantões</span>
                          </span>
                        </Button>
                      );
                    })}
                    {sectors.length === 0 && (
                      <Button variant="link" size="sm" onClick={() => navigate('/admin/sectors')}>
                        Criar primeiro setor
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Calendar Area */}
            <div className="flex-1 min-w-0">
              {/* Calendar Navigation */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={navigatePrevious}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="text-lg font-semibold min-w-[200px] text-center">
                    {viewMode === 'week' 
                      ? `Semana de ${format(calendarDays[0], 'dd/MM')} a ${format(calendarDays[6], 'dd/MM')}`
                      : format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                  </h3>
                  <Button variant="outline" size="icon" onClick={navigateNext}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'week' | 'month')}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Semana</SelectItem>
                    <SelectItem value="month">Mês</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Weekly View */}
              {viewMode === 'week' && (
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map(day => {
                const dayShifts = getShiftsForDate(day);
                return (
                  <Card 
                    key={day.toISOString()} 
                    className={`cursor-pointer hover:bg-accent/50 transition-colors ${isToday(day) ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => openDayDetail(day)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className={`text-sm ${isToday(day) ? 'text-primary' : ''}`}>
                        {format(day, 'EEE', { locale: ptBR })}
                      </CardTitle>
                      <CardDescription className="text-lg font-bold">
                        {format(day, 'd')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {dayShifts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sem plantões</p>
                      ) : (
                        dayShifts.slice(0, 3).map(shift => {
                          const shiftAssignments = getAssignmentsForShift(shift.id);
                          return (
                            <div 
                              key={shift.id} 
                              className="text-xs p-1 rounded"
                              style={{ 
                                backgroundColor: `${shift.sector?.color || '#22c55e'}20`,
                                borderLeft: `3px solid ${shift.sector?.color || '#22c55e'}`
                              }}
                            >
                              <div className="font-medium truncate">{shift.sector?.name || shift.hospital}</div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Users className="h-3 w-3" />
                                {shiftAssignments.length}
                              </div>
                            </div>
                          );
                        })
                      )}
                      {dayShifts.length > 3 && (
                        <p className="text-xs text-muted-foreground">+{dayShifts.length - 3} mais</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
              )}

              {/* Monthly View */}
              {viewMode === 'month' && (
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                    <div key={d} className="text-center text-sm font-medium text-muted-foreground py-2">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array(startOfMonth(currentDate).getDay()).fill(null).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[60px]" />
                  ))}
                  {calendarDays.map(day => {
                    const dayShifts = getShiftsForDate(day);
                    const totalAssignments = dayShifts.reduce((sum, s) => sum + getAssignmentsForShift(s.id).length, 0);
                    return (
                      <div
                        key={day.toISOString()}
                        className={`min-h-[60px] p-1 border rounded cursor-pointer hover:bg-accent/50
                          ${isToday(day) ? 'border-primary bg-primary/5' : 'border-border'}
                        `}
                        onClick={() => openDayDetail(day)}
                      >
                        <div className={`text-xs font-medium ${isToday(day) ? 'text-primary' : ''}`}>
                          {format(day, 'd')}
                        </div>
                        {dayShifts.length > 0 && (
                          <div className="mt-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {dayShifts.length} plantões • {totalAssignments} pessoas
                            </Badge>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
            </div>
          </div>
        </TabsContent>

        {/* Swaps Tab */}
        <TabsContent value="swaps">
          <Card>
            <CardHeader>
              <CardTitle>Trocas Pendentes</CardTitle>
              <CardDescription>Aprove ou rejeite solicitações de troca</CardDescription>
            </CardHeader>
            <CardContent>
              {swaps.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhuma troca pendente</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Solicitante</TableHead>
                      <TableHead>Plantão</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Data Solicitação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {swaps.map(swap => (
                      <TableRow key={swap.id}>
                        <TableCell className="font-medium">{swap.requester?.name || 'N/A'}</TableCell>
                        <TableCell>
                          {swap.origin_assignment?.shift?.title || 'N/A'}
                          <br />
                          <span className="text-xs text-muted-foreground">
                            {swap.origin_assignment?.shift?.shift_date && format(parseISO(swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy')}
                          </span>
                        </TableCell>
                        <TableCell>{swap.target_user?.name || 'Qualquer'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{swap.reason || '-'}</TableCell>
                        <TableCell>{format(parseISO(swap.created_at), 'dd/MM HH:mm')}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => handleSwapAction(swap.id, 'approved')}>
                              <Check className="mr-1 h-4 w-4" />
                              Aprovar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleSwapAction(swap.id, 'rejected')}>
                              <XIcon className="mr-1 h-4 w-4" />
                              Rejeitar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial">
          <Card>
            <CardHeader>
              <CardTitle>Resumo Financeiro - {format(currentDate, 'MMMM yyyy', { locale: ptBR })}</CardTitle>
              <CardDescription>Valores por plantonista e setor</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plantonista</TableHead>
                    <TableHead>Setores</TableHead>
                    <TableHead className="text-center">Plantões</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financialData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhum dado financeiro para este mês
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {financialData.map(f => (
                        <TableRow key={f.user_id}>
                          <TableCell className="font-medium">{f.user_name}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {f.sectors.map(s => (
                                <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                              ))}
                              {f.sectors.length === 0 && <span className="text-muted-foreground">-</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{f.total_shifts}</TableCell>
                          <TableCell className="text-right font-medium">
                            R$ {f.total_value.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>TOTAL</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-center">
                          {financialData.reduce((sum, f) => sum + f.total_shifts, 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          R$ {financialData.reduce((sum, f) => sum + f.total_value, 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Equipe</CardTitle>
                <CardDescription>Membros ativos e inativos</CardDescription>
              </div>
              <Button onClick={() => navigate('/admin/users')}>
                <UserPlus className="mr-2 h-4 w-4" />
                Gerenciar
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.profile?.name || 'Sem nome'}</TableCell>
                      <TableCell>
                        <Badge variant={m.role === 'admin' ? 'default' : 'secondary'}>
                          {m.role === 'admin' ? 'Administrador' : 'Plantonista'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.active ? 'outline' : 'secondary'}>
                          {m.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Day Detail Dialog */}
      <Dialog open={dayDialogOpen} onOpenChange={setDayDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
              <Button size="sm" onClick={() => { setDayDialogOpen(false); navigate('/admin/calendar'); }}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Plantão
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {selectedDate && getShiftsForDate(selectedDate).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum plantão neste dia</p>
            ) : (
              selectedDate && getShiftsForDate(selectedDate).map(shift => {
                const shiftAssignments = getAssignmentsForShift(shift.id);
                return (
                  <Card key={shift.id} style={{ borderLeft: `4px solid ${shift.sector?.color || '#22c55e'}` }}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{shift.title}</CardTitle>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            {shift.sector && (
                              <Badge style={{ backgroundColor: shift.sector.color, color: 'white' }}>
                                {shift.sector.name}
                              </Badge>
                            )}
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {shift.hospital}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                            </span>
                          </div>
                        </div>
                        <Badge variant="outline">R$ {Number(shift.base_value).toFixed(2)}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Users className="h-4 w-4" />
                          Plantonistas ({shiftAssignments.length}):
                        </div>
                        {shiftAssignments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum plantonista atribuído</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {shiftAssignments.map(a => (
                              <Badge key={a.id} variant="secondary">
                                {a.profile?.name || 'Sem nome'} • R$ {Number(a.assigned_value).toFixed(2)}
                              </Badge>
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
    </div>
  );
}
