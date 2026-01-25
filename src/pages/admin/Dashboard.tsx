import { useEffect, useMemo, useState } from 'react';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import { DashboardCharts } from '@/components/admin/DashboardCharts';
import { AnimatedNumber } from '@/components/AnimatedContainer';
import {
  Calendar,
  Users,
  ArrowLeftRight,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  UserPlus,
  Trash2,
  Check,
  X as XIcon,
  Building2,
  Eye,
  Plus,
  BarChart3,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  parseISO,
  startOfWeek,
  endOfWeek,
  addDays,
} from 'date-fns';
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
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);

  // Month selector options
  const [usedMonthValues, setUsedMonthValues] = useState<string[]>([]);
  const [loadingUsedMonths, setLoadingUsedMonths] = useState(false);

  // Data
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [financialData, setFinancialData] = useState<FinancialSummary[]>([]);
  
  // Dados do mês completo para os gráficos (independente do viewMode)
  const [monthShifts, setMonthShifts] = useState<Shift[]>([]);
  const [monthAssignmentsForCharts, setMonthAssignmentsForCharts] = useState<ShiftAssignment[]>([]);
  
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

  useEffect(() => {
    if (currentTenantId) {
      fetchUsedMonths();
    } else {
      setUsedMonthValues([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenantId]);

  async function fetchUsedMonths() {
    if (!currentTenantId) return;
    setLoadingUsedMonths(true);
    try {
      const used = new Set<string>();
      let from = 0;
      const pageSize = 1000;

      // Paginação para contornar o limite padrão de 1000 linhas
      // (precisamos apenas das datas para montar o filtro de meses já utilizados)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('shifts')
          .select('shift_date')
          .eq('tenant_id', currentTenantId)
          .order('shift_date', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) throw error;

        (data || []).forEach((row: any) => {
          if (row?.shift_date) {
            const d = parseISO(row.shift_date);
            used.add(format(d, 'yyyy-MM'));
          }
        });

        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      // Sempre incluir o mês atual no seletor (mesmo se ainda não há plantões)
      used.add(format(new Date(), 'yyyy-MM'));

      const sorted = Array.from(used).sort();
      setUsedMonthValues(sorted);
    } catch (e: any) {
      toast({
        title: 'Erro ao carregar meses',
        description: e?.message || 'Não foi possível carregar os meses disponíveis.',
        variant: 'destructive',
      });
      setUsedMonthValues([format(new Date(), 'yyyy-MM')]);
    } finally {
      setLoadingUsedMonths(false);
    }
  }

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

    const [shiftsRes, sectorsRes, membersRes, swapsRes, monthShiftsRes, monthShiftsFullRes] = await Promise.all([
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
      // Buscar shifts completos do mês para os gráficos
      supabase
        .from('shifts')
        .select('*, sector:sectors(*)')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('shift_date', format(monthEnd, 'yyyy-MM-dd'))
        .order('shift_date'),
    ]);

    if (sectorsRes.data) setSectors(sectorsRes.data);
    if (membersRes.data) setMembers(membersRes.data as unknown as Member[]);
    if (swapsRes.data) setSwaps(swapsRes.data as unknown as SwapRequest[]);

    if (shiftsRes.data) {
      setShifts(shiftsRes.data as unknown as Shift[]);
      
      // Fetch assignments para o calendario (view atual)
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

    // Processar dados do mês completo para os gráficos
    if (monthShiftsFullRes.data) {
      setMonthShifts(monthShiftsFullRes.data as unknown as Shift[]);
      
      // Fetch assignments do mês completo para os gráficos usando RPC para evitar limite de URL
      const { data: monthAssignmentsData } = await supabase
        .rpc('get_shift_assignments_range', {
          _tenant_id: currentTenantId,
          _start: format(monthStart, 'yyyy-MM-dd'),
          _end: format(monthEnd, 'yyyy-MM-dd')
        });
      
      if (monthAssignmentsData) {
        setMonthAssignmentsForCharts(monthAssignmentsData as unknown as ShiftAssignment[]);
      } else {
        setMonthAssignmentsForCharts([]);
      }
    } else {
      setMonthShifts([]);
      setMonthAssignmentsForCharts([]);
    }

    // Calculate financial data for the month
    const { data: monthAssignments } = await supabase
      .from('shift_assignments')
      .select(`
        user_id, assigned_value,
        profile:profiles!shift_assignments_user_id_profiles_fkey(name),
        shift:shifts!inner(shift_date, base_value, sector_id, sector:sectors(name))
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
        // Usar assigned_value se disponível, senão usar base_value do shift
        const value = a.assigned_value != null 
          ? Number(a.assigned_value) 
          : Number(a.shift?.base_value || 0);
        existing.total_value += value;
        
        const sectorName = a.shift?.sector?.name;
        if (sectorName && !existing.sectors.includes(sectorName)) {
          existing.sectors.push(sectorName);
        }
        
        summaryMap.set(a.user_id, existing);
      });
      
      setFinancialData(Array.from(summaryMap.values()).sort((a, b) => a.user_name.localeCompare(b.user_name, 'pt-BR')));
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

  // Month options:
  // - Passados: apenas meses em que já existiram plantões (dinâmico)
  // - Futuros: sempre disponíveis (janela crescente conforme você navega)
  const monthOptions = useMemo(() => {
    const now = new Date();
    const currentYm = format(currentDate, 'yyyy-MM');

    const used = new Set(usedMonthValues);
    used.add(currentYm);

    // Futuro: meses sempre disponíveis (bem amplo, “sem limite” na prática)
    // Baseia no maior entre hoje e o mês selecionado, para sempre ter meses à frente.
    const futureBase = startOfMonth(new Date(Math.max(now.getTime(), currentDate.getTime())));
    const futureMonthsToShow = 600; // ~50 anos
    for (let i = 1; i <= futureMonthsToShow; i++) {
      used.add(format(addMonths(futureBase, i), 'yyyy-MM'));
    }

    // Sempre incluir mês vigente (hoje)
    used.add(format(now, 'yyyy-MM'));

    return Array.from(used)
      .sort()
      .map((value) => {
        const [year, month] = value.split('-').map(Number);
        const date = new Date(year, month - 1, 1);
        return {
          value,
          label: format(date, 'MMMM yyyy', { locale: ptBR }),
        };
      });
  }, [usedMonthValues, currentDate]);

  if (loading) {
    return <div className="text-muted-foreground p-4">Carregando dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dashboard Administrativo</h2>
          <p className="text-muted-foreground">
            Visão completa do hospital - {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {/* Month/Year Selector */}
          <div className="flex w-full items-center gap-1 sm:w-auto">
            <Button
              variant="outline"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {isMobile ? (
              <select
                aria-label="Selecionar mês"
                value={format(currentDate, 'yyyy-MM')}
                onChange={(e) => {
                  const [year, month] = e.target.value.split('-').map(Number);
                  setCurrentDate(new Date(year, month - 1, 1));
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-[220px]"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <Select
                value={format(currentDate, 'yyyy-MM')}
                onValueChange={(v) => {
                  const [year, month] = v.split('-').map(Number);
                  setCurrentDate(new Date(year, month - 1, 1));
                }}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Selecione o mês" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              variant="outline"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
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
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => navigate('/admin/calendar')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Plantões do Mês</CardTitle>
            <Calendar className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <AnimatedNumber value={stats.totalShifts} />
            </div>
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

      {/* Main Content */}
      <div>
          <Tabs defaultValue="analytics" className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="analytics" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="swaps" className="gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                Trocas ({swaps.length})
              </TabsTrigger>
              <TabsTrigger value="financial" className="gap-2">
                <DollarSign className="h-4 w-4" />
                Financeiro
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-2">
                <Users className="h-4 w-4" />
                Equipe
              </TabsTrigger>
            </TabsList>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Análise do Mês</CardTitle>
              <CardDescription>Visualização de dados de {format(currentDate, 'MMMM yyyy', { locale: ptBR })}</CardDescription>
            </CardHeader>
            <CardContent>
              <DashboardCharts 
                shifts={monthShifts}
                assignments={monthAssignmentsForCharts}
                sectors={sectors}
                members={members.filter(m => m.active).map(m => ({ id: m.user_id, name: m.profile?.name || null }))}
                currentMonth={currentDate}
              />
            </CardContent>
          </Card>
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
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle>Resumo Financeiro - {format(currentDate, 'MMMM yyyy', { locale: ptBR })}</CardTitle>
                <CardDescription>Valores por plantonista e setor</CardDescription>
              </div>

              {/* Seletor de mês (também aqui, para não precisar voltar ao topo) */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Mês anterior"
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {isMobile ? (
                  <select
                    aria-label="Selecionar mês do resumo financeiro"
                    value={format(currentDate, 'yyyy-MM')}
                    onChange={(e) => {
                      const [year, month] = e.target.value.split('-').map(Number);
                      setCurrentDate(new Date(year, month - 1, 1));
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-[220px]"
                  >
                    {monthOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Select
                    value={format(currentDate, 'yyyy-MM')}
                    onValueChange={(v) => {
                      const [year, month] = v.split('-').map(Number);
                      setCurrentDate(new Date(year, month - 1, 1));
                    }}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Selecione o mês" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {monthOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Próximo mês"
                  onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
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
                  {[...members]
                    .sort((a, b) => (a.profile?.name || 'Zzz').localeCompare(b.profile?.name || 'Zzz', 'pt-BR'))
                    .map(m => (
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
      </div>

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
                            {[...shiftAssignments]
                              .sort((a, b) => (a.profile?.name || 'Zzz').localeCompare(b.profile?.name || 'Zzz', 'pt-BR'))
                              .map(a => (
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
