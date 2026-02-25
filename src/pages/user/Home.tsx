import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { parseDateOnly } from '@/lib/utils';
import { mapScheduleToFinancialEntries } from '@/lib/financial/mapScheduleToEntries';
import { aggregateFinancial } from '@/lib/financial/aggregateFinancial';
import type { ScheduleAssignment, ScheduleShift, SectorLookup } from '@/lib/financial/types';
import { CalendarDays, Bell, ArrowLeftRight, Hand, Wallet, Building2, Clock3, ChevronRight, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MyShiftStatsChart } from '@/components/user/MyShiftStatsChart';

type SectorMember = { sector_id: string; sector: { id: string; name: string; color: string | null } | null };
type NotificationRow = { id: string };
type ShiftRow = {
  id: string;
  title: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector: { name: string } | null;
};

export default function UserHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const [sectorMemberships, setSectorMemberships] = useState<SectorMember[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<ShiftRow[]>([]);

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pendingIncomingSwaps, setPendingIncomingSwaps] = useState(0);
  const [pendingOutgoingSwaps, setPendingOutgoingSwaps] = useState(0);
  const [availableInMySectors, setAvailableInMySectors] = useState(0);

  const [monthSummary, setMonthSummary] = useState({
    shifts: 0,
    hours: 0,
    value: 0,
    unpriced: 0,
  });

  const months = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' },
  ];

  const years = useMemo(() => {
    const base = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => base - 3 + i);
  }, []);

  useEffect(() => {
    if (!user?.id || !currentTenantId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentTenantId, month, year]);

  async function fetchData() {
    if (!user?.id || !currentTenantId) return;
    setLoading(true);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const [
      membershipsRes,
      unreadRes,
      incomingSwapRes,
      outgoingSwapRes,
      monthlyAssignmentsRes,
      upcomingRes,
      userValuesRes,
    ] = await Promise.all([
      supabase
        .from('sector_memberships')
        .select('sector_id, sector:sectors(id, name, color)')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id),
      supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .is('read_at', null),
      supabase
        .from('swap_requests')
        .select('id')
        .eq('tenant_id', currentTenantId)
        .eq('target_user_id', user.id)
        .eq('status', 'pending'),
      supabase
        .from('swap_requests')
        .select('id')
        .eq('tenant_id', currentTenantId)
        .eq('requester_id', user.id)
        .eq('status', 'pending'),
      supabase
        .from('shift_assignments')
        .select(`
          id, assigned_value,
          shift:shifts!inner(
            id, title, hospital, shift_date, start_time, end_time, sector_id, base_value,
            sector:sectors(id, name, default_day_value, default_night_value)
          )
        `)
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .in('status', ['assigned', 'confirmed', 'completed'])
        .gte('shift.shift_date', startDate)
        .lte('shift.shift_date', endDate),
      supabase
        .from('shift_assignments')
        .select(`
          id,
          shift:shifts!inner(
            id, title, shift_date, start_time, end_time,
            sector:sectors(name)
          )
        `)
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .in('status', ['assigned', 'confirmed'])
        .gte('shift.shift_date', today)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('user_sector_values')
        .select('sector_id, user_id, day_value, night_value')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .eq('month', month)
        .eq('year', year),
    ]);

    const memberships = (membershipsRes.data ?? []) as unknown as SectorMember[];
    setSectorMemberships(memberships);
    setUnreadNotifications((unreadRes.data as NotificationRow[] | null)?.length ?? 0);
    setPendingIncomingSwaps((incomingSwapRes.data as NotificationRow[] | null)?.length ?? 0);
    setPendingOutgoingSwaps((outgoingSwapRes.data as NotificationRow[] | null)?.length ?? 0);

    const assignmentsRows = (monthlyAssignmentsRes.data ?? []) as any[];
    const scheduleShifts: ScheduleShift[] = assignmentsRows
      .map((a) => a.shift)
      .filter(Boolean)
      .map((s) => ({
        id: s.id,
        shift_date: s.shift_date,
        start_time: s.start_time,
        end_time: s.end_time,
        sector_id: s.sector_id ?? null,
        base_value: s.base_value ?? null,
        title: s.title,
        hospital: s.hospital,
      }));

    const scheduleAssignments: ScheduleAssignment[] = assignmentsRows.map((a) => ({
      id: a.id,
      shift_id: a.shift?.id ?? '',
      user_id: user.id,
      assigned_value: a.assigned_value ?? null,
      profile_name: 'Você',
    }));

    const sectorLookup: SectorLookup[] = Array.from(
      new Map(
        assignmentsRows
          .map((a) => a.shift?.sector)
          .filter(Boolean)
          .map((s) => [s.id, { id: s.id, name: s.name, default_day_value: s.default_day_value, default_night_value: s.default_night_value }])
      ).values()
    );

    const entries = mapScheduleToFinancialEntries({
      shifts: scheduleShifts,
      assignments: scheduleAssignments,
      sectors: sectorLookup,
      userSectorValues: (userValuesRes.data ?? []) as any[],
    });

    const { grandTotals } = aggregateFinancial(entries);
    setMonthSummary({
      shifts: grandTotals.totalShifts,
      hours: grandTotals.totalHours,
      value: grandTotals.totalValue,
      unpriced: grandTotals.unpricedShifts,
    });

    const upRows = (upcomingRes.data ?? []) as any[];
    const shifts = upRows
      .map((r) => r.shift)
      .filter(Boolean)
      .sort((a, b) => `${a.shift_date}T${a.start_time}`.localeCompare(`${b.shift_date}T${b.start_time}`))
      .slice(0, 6) as ShiftRow[];
    setUpcomingShifts(shifts);

    const memberSectorIds = memberships.map((m) => m.sector_id).filter(Boolean);
    if (memberSectorIds.length > 0) {
      const end = format(new Date(new Date().setMonth(new Date().getMonth() + 2)), 'yyyy-MM-dd');
      const [shiftsRes, rosterRes] = await Promise.all([
        supabase
          .from('shifts')
          .select('id, sector_id')
          .eq('tenant_id', currentTenantId)
          .in('sector_id', memberSectorIds)
          .gte('shift_date', today)
          .lte('shift_date', end),
        supabase.rpc('get_shift_roster', {
          _tenant_id: currentTenantId,
          _start: today,
          _end: end,
        }),
      ]);
      const takenIds = new Set(((rosterRes.data ?? []) as any[]).map((r) => r.shift_id));
      const openCount = ((shiftsRes.data ?? []) as any[]).filter((s) => !takenIds.has(s.id)).length;
      setAvailableInMySectors(openCount);
    } else {
      setAvailableInMySectors(0);
    }

    setLoading(false);
  }

  const metricCards = [
    { label: 'Plantões no mês', value: loading ? '...' : String(monthSummary.shifts), icon: Calendar },
    { label: 'Horas no mês', value: loading ? '...' : `${monthSummary.hours.toFixed(1)}h`, icon: Clock3 },
    {
      label: 'Valor estimado',
      value: loading ? '...' : `R$ ${monthSummary.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: Wallet,
    },
    { label: 'Setores vinculados', value: loading ? '...' : String(sectorMemberships.length), icon: Building2 },
  ];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/[0.05] shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-bold">Visão do Usuário</h1>
              <p className="text-xs text-muted-foreground">Escala, setores, financeiro e ações importantes.</p>
            </div>
            <div className="flex gap-2">
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-9 w-32 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-9 w-24 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {metricCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-primary/20 bg-background/80 p-3 shadow-sm">
                <div className="mb-1 flex items-center justify-between text-muted-foreground">
                  <span className="text-[11px]">{card.label}</span>
                  <card.icon className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-bold leading-none">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="outline" className="h-10 justify-start rounded-2xl gap-2 border-primary/30 bg-background/80 hover:bg-primary/10" onClick={() => navigate('/app/calendar')}>
              <CalendarDays className="h-4 w-4" /> Agenda Geral
            </Button>
            <Button variant="outline" className="h-10 justify-start rounded-2xl gap-2 border-primary/30 bg-background/80 hover:bg-primary/10" onClick={() => navigate('/app/shifts')}>
              <Clock3 className="h-4 w-4" /> Minha Agenda
            </Button>
            <Button variant="outline" className="h-10 justify-start rounded-2xl gap-2 border-primary/30 bg-background/80 hover:bg-primary/10" onClick={() => navigate('/app/financial')}>
              <Wallet className="h-4 w-4" /> Financeiro
            </Button>
            <Button variant="outline" className="h-10 justify-start rounded-2xl gap-2 border-primary/30 bg-background/80 hover:bg-primary/10" onClick={() => navigate('/app/swaps')}>
              <ArrowLeftRight className="h-4 w-4" /> Trocas
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-primary/20 bg-card/90 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Meus Setores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sectorMemberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não está vinculado a setores.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sectorMemberships.map((m) => (
                  <Badge key={m.sector_id} variant="secondary" className="rounded-full border" style={m.sector?.color ? { borderColor: m.sector.color } : undefined}>
                    {m.sector?.name || 'Setor'}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Você visualiza os setores vinculados mesmo quando não está escalado.</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-card/90 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base">Atenção</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <button className="flex w-full items-center justify-between rounded-lg border border-border/60 px-2 py-2 text-left hover:bg-accent/30" onClick={() => navigate('/app/notifications')}>
              <span className="flex items-center gap-2"><Bell className="h-4 w-4" /> Não lidas</span><Badge>{unreadNotifications}</Badge>
            </button>
            <button className="flex w-full items-center justify-between rounded-lg border border-border/60 px-2 py-2 text-left hover:bg-accent/30" onClick={() => navigate('/app/swaps')}>
              <span className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Trocas para responder</span><Badge>{pendingIncomingSwaps}</Badge>
            </button>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-2 py-2"><span className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Trocas aguardando colega</span><Badge>{pendingOutgoingSwaps}</Badge></div>
            <button className="flex w-full items-center justify-between rounded-lg border border-border/60 px-2 py-2 text-left hover:bg-accent/30" onClick={() => navigate('/app/available')}>
              <span className="flex items-center gap-2"><Hand className="h-4 w-4" /> Plantões disponíveis no meu setor</span><Badge>{availableInMySectors}</Badge>
            </button>
            {monthSummary.unpriced > 0 && (
              <p className="text-xs text-amber-600">Há {monthSummary.unpriced} plantão(ões) sem valor definido neste mês.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-card/90 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">Próximos Plantões</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {upcomingShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum plantão futuro confirmado.</p>
          ) : (
            upcomingShifts.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate('/app/shifts')}
                className="flex w-full items-center justify-between rounded-xl border border-border/70 p-3 text-left transition-colors hover:bg-accent/40"
              >
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseDateOnly(s.shift_date), 'dd/MM/yyyy', { locale: ptBR })} • {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.sector?.name || 'Sem setor'}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <MyShiftStatsChart />
      </div>
    </div>
  );
}
