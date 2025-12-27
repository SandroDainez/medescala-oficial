import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { mapScheduleToFinancialEntries } from '@/lib/financial/mapScheduleToEntries';
import type { FinancialEntry, ScheduleAssignment, ScheduleShift, SectorLookup } from '@/lib/financial/types';
import { aggregateFinancial } from '@/lib/financial/aggregateFinancial';
import { DollarSign, Calendar, Clock, Building, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDateOnly } from '@/lib/utils';

type ShiftDetail = FinancialEntry;

interface SectorSummary {
  sector_id: string;
  sector_name: string;
  total_shifts: number;
  total_hours: number;
  total_value: number;
  shifts: ShiftDetail[];
}

interface FinancialSummary {
  totalShifts: number;
  totalHours: number;
  totalValue: number;
  unpricedShifts: number;
  status: string | null;
}

export default function UserFinancial() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const [summary, setSummary] = useState<FinancialSummary>({ totalShifts: 0, totalHours: 0, totalValue: 0, unpricedShifts: 0, status: null });
  const [shifts, setShifts] = useState<ShiftDetail[]>([]);
  const [sectorSummaries, setSectorSummaries] = useState<SectorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [didAutoSelect, setDidAutoSelect] = useState(false);
  const [allAssignmentDates, setAllAssignmentDates] = useState<string[]>([]);

  const now = new Date();
  const effectiveMonth = selectedMonth ?? (now.getMonth() + 1); // 1-12
  const effectiveYear = selectedYear ?? now.getFullYear();

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
    { value: 12, label: 'Dezembro' }
  ];

  // Gera anos dinamicamente baseado nos dados
  const years = useMemo(() => {
    const baseYear = new Date().getFullYear();
    const dataYears = allAssignmentDates.map(d => Number(d.slice(0, 4)));
    const allYears = new Set([baseYear - 1, baseYear, baseYear + 1, baseYear + 2, ...dataYears]);
    return Array.from(allYears).sort((a, b) => a - b);
  }, [allAssignmentDates]);

  useEffect(() => {
    if (user && currentTenantId) {
      setDidAutoSelect(false);
      fetchAllDates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentTenantId]);

  useEffect(() => {
    if (user && currentTenantId && selectedMonth !== null && selectedYear !== null) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentTenantId, selectedMonth, selectedYear]);

  // Fetch all assignment dates to determine available years and auto-select
  async function fetchAllDates() {
    if (!currentTenantId || !user) return;

    const { data } = await supabase
      .from('shift_assignments')
      .select('shift:shifts!inner(shift_date)')
      .eq('tenant_id', currentTenantId)
      .eq('user_id', user.id)
      .in('status', ['assigned', 'confirmed', 'completed']);

    if (data && data.length > 0) {
      const dates = data
        .map((d: any) => d.shift?.shift_date)
        .filter(Boolean) as string[];

      setAllAssignmentDates(dates);

      // Auto-select: navega para o mês mais recente com dados
      if (!didAutoSelect) {
        const sortedDates = [...dates].sort((a, b) => b.localeCompare(a)); // Mais recente primeiro
        const latestDate = sortedDates[0];
        if (latestDate) {
          const d = parseDateOnly(latestDate);
          setSelectedMonth(d.getMonth() + 1);
          setSelectedYear(d.getFullYear());
          setDidAutoSelect(true);
        }
      }
    } else {
      setAllAssignmentDates([]);
      // Se não há dados, mostrar mês atual
      if (!didAutoSelect) {
        setSelectedMonth(now.getMonth() + 1);
        setSelectedYear(now.getFullYear());
        setDidAutoSelect(true);
      }
    }
  }

  async function fetchData() {
    if (!currentTenantId || !user || selectedMonth === null || selectedYear === null) return;
    setLoading(true);

    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

    const { data: assignments, error } = await supabase
      .from('shift_assignments')
      .select(`
        id, 
        assigned_value, 
        checkin_at, 
        checkout_at, 
        shift:shifts!inner(
          id,
          title, 
          hospital, 
          shift_date, 
          base_value,
          start_time,
          end_time,
          sector_id,
          sector:sectors(id, name)
        )
      `)
      .eq('tenant_id', currentTenantId)
      .eq('user_id', user.id)
      .in('status', ['assigned', 'confirmed', 'completed'])
      .gte('shift.shift_date', startDate)
      .lte('shift.shift_date', endDate);

    if (error) {
      console.error('[UserFinancial] Error fetching:', error);
      toast({ title: 'Erro ao carregar financeiro', description: error.message, variant: 'destructive' });
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('status')
      .eq('tenant_id', currentTenantId)
      .eq('user_id', user?.id)
      .eq('month', selectedMonth)
      .eq('year', selectedYear)
      .maybeSingle();

    if (assignments && assignments.length > 0) {

      // Normaliza a partir da MESMA fonte da Escala
      const scheduleShifts: ScheduleShift[] = assignments
        .map((a: any) => a.shift)
        .filter(Boolean)
        .map((s: any) => ({
          id: s.id ?? '',
          shift_date: s.shift_date,
          start_time: s.start_time,
          end_time: s.end_time,
          sector_id: s.sector?.id ?? s.sector_id ?? null,
          base_value: s.base_value !== null ? Number(s.base_value) : null,
          title: s.title,
          hospital: s.hospital,
        }));

      const scheduleAssignments: ScheduleAssignment[] = assignments.map((a: any) => ({
        id: a.id,
        shift_id: a.shift?.id ?? '',
        user_id: user.id,
        assigned_value: a.assigned_value !== null ? Number(a.assigned_value) : null,
        profile_name: undefined, // user view doesn't need this
      }));

      const sectors: SectorLookup[] = Array.from(
        new Map(
          assignments
            .map((a: any) => a.shift?.sector)
            .filter(Boolean)
            .map((sec: any) => [sec.id, { id: sec.id, name: sec.name }])
        ).values()
      );

      const mappedEntries = mapScheduleToFinancialEntries({
        shifts: scheduleShifts,
        assignments: scheduleAssignments,
        sectors,
        unassignedLabel: { id: 'unassigned', name: 'Vago' },
      }).map((e) => ({
        ...e,
        assignee_name: 'Você',
      }));

      setShifts(mappedEntries);

      // Build sector summaries
      const sectorMap: Record<string, SectorSummary> = {};
      mappedEntries.forEach((entry) => {
        const sectorKey = entry.sector_id || 'sem-setor';
        if (!sectorMap[sectorKey]) {
          sectorMap[sectorKey] = {
            sector_id: sectorKey,
            sector_name: entry.sector_name,
            total_shifts: 0,
            total_hours: 0,
            total_value: 0,
            shifts: [],
          };
        }
        sectorMap[sectorKey].total_shifts++;
        sectorMap[sectorKey].total_hours += entry.duration_hours;
        if (entry.value_source !== 'invalid' && entry.final_value !== null) {
          sectorMap[sectorKey].total_value += entry.final_value;
        }
        sectorMap[sectorKey].shifts.push(entry);
      });

      const sectorList = Object.values(sectorMap).sort((a, b) => b.total_value - a.total_value);
      setSectorSummaries(sectorList);

      const { grandTotals } = aggregateFinancial(mappedEntries);

      setSummary({
        totalShifts: grandTotals.totalShifts,
        totalHours: grandTotals.totalHours,
        totalValue: grandTotals.totalValue,
        unpricedShifts: grandTotals.unpricedShifts,
        status: payment?.status || null,
      });
    } else {
      setShifts([]);
      setSectorSummaries([]);
      setSummary({ totalShifts: 0, totalHours: 0, totalValue: 0, unpricedShifts: 0, status: payment?.status || null });
    }

    setLoading(false);
  }

  if (loading) return <div className="text-muted-foreground p-4">Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Financeiro</h2>
          <p className="text-muted-foreground">Seu resumo mensal de plantões</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => (
                <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Plantões</CardTitle>
            <Calendar className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalShifts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Setores</CardTitle>
            <Building className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sectorSummaries.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Horas</CardTitle>
            <Clock className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalHours.toFixed(1)}h</div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total a Receber</CardTitle>
            <DollarSign className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-green-600">
                R$ {summary.totalValue.toFixed(2)}
              </span>
              {summary.status && (
                <Badge variant="outline">
                  {summary.status === 'closed' ? 'Fechado' : summary.status === 'paid' ? 'Pago' : 'Aberto'}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* No data message */}
      {shifts.length === 0 && (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">Nenhum plantão neste período</h3>
            <p className="text-muted-foreground">
              Não há plantões registrados em {months.find(m => m.value === selectedMonth)?.label} de {selectedYear}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Detailed Report by Sector */}
      {shifts.length > 0 && (
        <div className="space-y-4">
          {sectorSummaries.map(sector => (
            <Card key={sector.sector_id} className="overflow-hidden">
              {/* Sector Header */}
              <div className="bg-primary/10 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-bold text-foreground">{sector.sector_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {sector.total_shifts} plantão(ões) • {sector.total_hours.toFixed(1)} horas
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Subtotal</p>
                  <p className="font-bold text-lg text-green-600">
                    R$ {sector.total_value.toFixed(2)}
                  </p>
                </div>
              </div>
              
              {/* Shifts Table */}
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead>Data</TableHead>
                    <TableHead>Plantão</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead className="text-center">Duração</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sector.shifts.map(shift => (
                    <TableRow key={shift.id}>
                      <TableCell className="font-medium">
                        {shift.shift_date && format(parseDateOnly(shift.shift_date), 'dd/MM (EEE)', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{shift.title}</p>
                          <p className="text-xs text-muted-foreground">{shift.hospital}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{shift.duration_hours.toFixed(1)}h</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        R$ {shift.assigned_value.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))}

          {/* Summary by Sector */}
          <Card className="bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Resumo por Setor
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Setor</TableHead>
                    <TableHead className="text-center">Plantões</TableHead>
                    <TableHead className="text-center">Horas</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectorSummaries.map(sector => (
                    <TableRow key={sector.sector_id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          {sector.sector_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{sector.total_shifts}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{sector.total_hours.toFixed(1)}h</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        R$ {sector.total_value.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <tr className="bg-primary/10 font-bold text-foreground">
                    <td className="p-3">TOTAL GERAL</td>
                    <td className="p-3 text-center">{summary.totalShifts} plantões</td>
                    <td className="p-3 text-center">{summary.totalHours.toFixed(1)}h</td>
                    <td className="p-3 text-right text-green-600 text-lg">
                      R$ {summary.totalValue.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
