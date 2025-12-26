import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { runFinancialSelfTest } from '@/lib/financial/selfTest';
import { aggregateFinancial, buildAuditInfo, type PlantonistaReport, type SectorReport } from '@/lib/financial/aggregateFinancial';
import { mapScheduleToFinancialEntries } from '@/lib/financial/mapScheduleToEntries';
import type { FinancialEntry, ScheduleAssignment, ScheduleShift, SectorLookup } from '@/lib/financial/types';
import { Download, DollarSign, Users, Calendar, Filter, ChevronDown, ChevronRight, Building, AlertCircle, FileText, Printer, Clock, Eye } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ============================================================
// MODELO ÚNICO (mesma fonte da Escala)
// ============================================================

type RawShiftEntry = FinancialEntry;

type AuditData = ReturnType<typeof buildAuditInfo>;

function formatCurrency(value: number | null): string {
  if (value === null) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function AdminFinancial() {
  const { currentTenantId } = useTenant();
  
  // Raw data from DB
  const [rawEntries, setRawEntries] = useState<RawShiftEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selfTestResult, setSelfTestResult] = useState<{ ok: boolean; errors: string[] } | null>(null);
  
  // Filters
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterSetor, setFilterSetor] = useState<string>('all');
  const [filterPlantonista, setFilterPlantonista] = useState<string>('all');
  
  // Audit mode
  const [auditMode, setAuditMode] = useState(false);
  
  // Expand/collapse
  const [expandedPlantonistas, setExpandedPlantonistas] = useState<Set<string>>(new Set());
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  // Modal de detalhamento (tabela por plantonista)
  const [selectedPlantonista, setSelectedPlantonista] = useState<PlantonistaReport | null>(null);
  // Unique sectors and plantonistas for filters
  const sectors = useMemo(() => {
    const map = new Map<string, string>();
    rawEntries.forEach(e => {
      if (e.sector_id) map.set(e.sector_id, e.sector_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawEntries]);

  const plantonistas = useMemo(() => {
    const map = new Map<string, string>();
    rawEntries.forEach(e => {
      map.set(e.assignee_id, e.assignee_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawEntries]);

  // Quick date presets
  function setThisMonth() {
    setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  }
  function setLastMonth() {
    const lastMonth = subMonths(new Date(), 1);
    setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
    setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
  }

  // Fetch data
  useEffect(() => {
    if (currentTenantId) fetchData();
  }, [currentTenantId, startDate, endDate]);

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);

    // FONTE REAL DA ESCALA: shifts + shift_assignments (+ sectors + profiles)
    const { data: shifts, error: shiftsError } = await supabase
      .from('shifts')
      .select('id, shift_date, start_time, end_time, sector_id, base_value')
      .eq('tenant_id', currentTenantId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)
      .order('shift_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (shiftsError) {
      console.error('[AdminFinancial] Fetch shifts error:', shiftsError);
      setRawEntries([]);
      setLoading(false);
      return;
    }

    const shiftIds = (shifts ?? []).map((s) => s.id);

    const [{ data: assignments, error: assignmentsError }, { data: sectors, error: sectorsError }] =
      await Promise.all([
        shiftIds.length
          ? supabase
              .from('shift_assignments')
              .select('id, shift_id, user_id, assigned_value, profile:profiles!shift_assignments_user_id_profiles_fkey(name)')
              .eq('tenant_id', currentTenantId)
              .in('shift_id', shiftIds)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from('sectors')
          .select('id, name')
          .eq('tenant_id', currentTenantId)
          .eq('active', true),
      ]);

    if (assignmentsError) {
      console.error('[AdminFinancial] Fetch assignments error:', assignmentsError);
      setRawEntries([]);
      setLoading(false);
      return;
    }

    if (sectorsError) {
      console.error('[AdminFinancial] Fetch sectors error:', sectorsError);
      // still proceed without sector names
    }

    const mapped = mapScheduleToFinancialEntries({
      shifts: (shifts ?? []) as unknown as ScheduleShift[],
      assignments: ((assignments ?? []) as any[]).map(
        (a): ScheduleAssignment => ({
          id: a.id,
          shift_id: a.shift_id,
          user_id: a.user_id,
          assigned_value: a.assigned_value !== null ? Number(a.assigned_value) : null,
          profile_name: a.profile?.name ?? null,
        })
      ),
      sectors: (sectors ?? []) as unknown as SectorLookup[],
    });

    setRawEntries(mapped);
    setLoading(false);
  }

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return rawEntries.filter(e => {
      if (filterSetor !== 'all' && e.sector_id !== filterSetor) return false;
      if (filterPlantonista !== 'all' && e.assignee_id !== filterPlantonista) return false;
      return true;
    });
  }, [rawEntries, filterSetor, filterPlantonista]);

  // ============================================================
  // AGREGAÇÃO ÚNICA (usa final_value já normalizado)
  // ============================================================

  const { grandTotals, plantonistaReports, sectorReports } = useMemo(() => {
    return aggregateFinancial(filteredEntries);
  }, [filteredEntries]);

  const auditData = useMemo((): AuditData => {
    return buildAuditInfo(filteredEntries);
  }, [filteredEntries]);


  // Toggle helpers
  function togglePlantonista(id: string) {
    setExpandedPlantonistas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }
  function toggleSector(id: string) {
    setExpandedSectors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }

  // Export CSV
  function exportCSV() {
    const headers = ['Data', 'Horário', 'Duração (h)', 'Setor', 'Plantonista', 'Valor'];
    const rows = filteredEntries.map(e => {
      const val = e.value_source === 'invalid' ? null : e.final_value;
      return [
        format(parseISO(e.shift_date), 'dd/MM/yyyy'),
        `${e.start_time?.slice(0, 5) || ''} - ${e.end_time?.slice(0, 5) || ''}`,
        e.duration_hours.toFixed(1),
        e.sector_name,
        e.assignee_name,
        val !== null ? val.toFixed(2) : 'Sem valor',
      ];
    });
    rows.push(['', '', '', '', 'TOTAL', grandTotals.totalValue.toFixed(2)]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-${startDate}-a-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Financeiro
          </h1>
          <p className="text-muted-foreground">Relatório detalhado de plantões e valores</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-2 mr-4">
            <Switch checked={auditMode} onCheckedChange={setAuditMode} id="audit-mode" />
            <Label htmlFor="audit-mode" className="flex items-center gap-1 cursor-pointer">
              <Eye className="h-4 w-4" />
              Auditoria
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label>Data Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label>Data Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={setThisMonth}>Este mês</Button>
              <Button variant="outline" size="sm" onClick={setLastMonth}>Mês anterior</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5 min-w-[200px]">
              <Label>Setor</Label>
              <Select value={filterSetor} onValueChange={setFilterSetor}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os setores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os setores</SelectItem>
                  {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[200px]">
              <Label>Plantonista</Label>
              <Select value={filterPlantonista} onValueChange={setFilterPlantonista}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os plantonistas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os plantonistas</SelectItem>
                  {plantonistas.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><Users className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Plantonistas</p>
                <p className="text-lg md:text-xl font-bold truncate">{grandTotals.totalPlantonistas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Calendar className="h-5 w-5 text-blue-500" /></div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Plantões</p>
                <p className="text-lg md:text-xl font-bold truncate">{grandTotals.totalShifts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg"><Clock className="h-5 w-5 text-purple-500" /></div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Horas</p>
                <p className="text-lg md:text-xl font-bold truncate">{grandTotals.totalHours.toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg"><AlertCircle className="h-5 w-5 text-amber-500" /></div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Sem Valor</p>
                <p className="text-lg md:text-xl font-bold truncate">{grandTotals.unpricedShifts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg"><DollarSign className="h-5 w-5 text-green-500" /></div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Total Geral</p>
                <p className="text-lg md:text-xl font-bold text-green-600 truncate">{formatCurrency(grandTotals.totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AUDIT MODE PANEL */}
      {auditMode && (
        <Card className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Eye className="h-5 w-5" />
              Modo Auditoria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm flex-1">
                <div><span className="font-medium">Total carregado:</span> {auditData.totalLoaded}</div>
                <div><span className="font-medium text-green-600">Com valor:</span> {auditData.withValue}</div>
                <div><span className="font-medium text-amber-600">Sem valor:</span> {auditData.withoutValue}</div>
                <div><span className="font-medium text-red-600">Valor inválido:</span> {auditData.invalidValue}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelfTestResult(runFinancialSelfTest())}
                >
                  Rodar self-test
                </Button>
                {selfTestResult && (
                  selfTestResult.ok ? (
                    <Badge variant="secondary" className="text-green-700 bg-green-100">Self-test OK</Badge>
                  ) : (
                    <Badge variant="destructive">Self-test FALHOU</Badge>
                  )
                )}
              </div>
            </div>
            {selfTestResult && !selfTestResult.ok && (
              <div className="text-sm border rounded p-3 bg-background">
                <p className="font-medium mb-1 text-red-600">Falhas:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {selfTestResult.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="border-t pt-4">
              <p className="font-medium mb-2">Detalhamento da soma (IDs incluídos):</p>
              <ScrollArea className="max-h-[200px] border rounded p-2 bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">ID</TableHead>
                      <TableHead>Plantonista</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditData.sumDetails.map(d => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">{d.id}</TableCell>
                        <TableCell>{d.assignee_name}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(d.final_value)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2} className="text-right">SOMA FINAL</TableCell>
                      <TableCell className="text-right text-green-600 text-lg">{formatCurrency(auditData.finalSum)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TABS: Dia a Dia | Tabela de Plantonistas | Por Plantonista | Por Setor | Todos os Plantões */}
      <Tabs defaultValue="dia" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dia">Dia a Dia</TabsTrigger>
          <TabsTrigger value="plantonistas_tabela">Plantonistas (tabela)</TabsTrigger>
          <TabsTrigger value="plantonista">Por Plantonista</TabsTrigger>
          <TabsTrigger value="setor">Por Setor</TabsTrigger>
          <TabsTrigger value="todos">Todos os Plantões</TabsTrigger>
        </TabsList>

        {/* TAB: Dia a Dia */}
        <TabsContent value="dia" className="space-y-2 mt-4">
          {filteredEntries.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Nenhum plantão encontrado no período.</p></CardContent></Card>
          ) : (
            (() => {
              // Agrupar por dia
              const byDay = filteredEntries.reduce((acc, entry) => {
                const day = entry.shift_date;
                if (!acc[day]) acc[day] = [];
                acc[day].push(entry);
                return acc;
              }, {} as Record<string, FinancialEntry[]>);

              // Garantir que TODOS os dias do intervalo apareçam (mesmo sem plantões)
              const allDays = eachDayOfInterval({
                start: parseISO(startDate),
                end: parseISO(endDate),
              }).map((d) => format(d, 'yyyy-MM-dd'));

              return (
                <div className="h-[calc(100vh-400px)] min-h-[400px] overflow-y-auto border rounded-lg">
                  <div className="space-y-1 p-1">
                    {allDays.map((day) => {
                      const dayEntries = (byDay[day] ?? []).sort((a, b) =>
                        (a.start_time || '').localeCompare(b.start_time || '')
                      );

                      const dayTotal = dayEntries.reduce((sum, e) => {
                        if (e.value_source !== 'invalid' && e.final_value !== null) {
                          return sum + e.final_value;
                        }
                        return sum;
                      }, 0);

                      return (
                        <Card key={day} className="overflow-hidden">
                          <div className="bg-muted/60 px-4 py-2 flex items-center justify-between border-b">
                            <span className="font-semibold">
                              {format(parseISO(day), 'dd/MM (EEEE)', { locale: ptBR })}
                            </span>
                            {dayEntries.length > 0 ? (
                              <span className="text-green-600 font-bold">{formatCurrency(dayTotal)}</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">Sem plantões</span>
                            )}
                          </div>

                          <CardContent className="p-0">
                            <Table>
                              <TableBody>
                                {dayEntries.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                                      Nenhum plantão neste dia.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  dayEntries.map((e) => {
                                    const val = e.value_source === 'invalid' ? null : e.final_value;
                                    return (
                                      <TableRow key={e.id}>
                                        <TableCell className="w-28 text-muted-foreground">
                                          {e.start_time?.slice(0, 5)} - {e.end_time?.slice(0, 5)}
                                        </TableCell>
                                        <TableCell className="font-medium">{e.assignee_name}</TableCell>
                                        <TableCell className="text-muted-foreground text-sm">{e.sector_name}</TableCell>
                                        <TableCell className="text-right w-32">
                                          {val !== null ? (
                                            <span className="text-green-600 font-medium">{formatCurrency(val)}</span>
                                          ) : (
                                            <span className="text-amber-500 text-sm">Sem valor definido</span>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })
                                )}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          )}
        </TabsContent>

        {/* TAB: Plantonistas (tabela) */}
        <TabsContent value="plantonistas_tabela" className="space-y-4 mt-4">
          {plantonistaReports.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum plantão encontrado no período.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Plantonistas — totais do período</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[70vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Plantonista</TableHead>
                        <TableHead className="text-center">Plantões</TableHead>
                        <TableHead className="text-center">Horas</TableHead>
                        <TableHead className="text-center">Sem valor</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plantonistaReports.map((p) => (
                        <TableRow key={p.assignee_id}>
                          <TableCell className="font-medium">{p.assignee_name}</TableCell>
                          <TableCell className="text-center">{p.total_shifts}</TableCell>
                          <TableCell className="text-center">{p.total_hours.toFixed(1)}h</TableCell>
                          <TableCell className="text-center">
                            {p.unpriced_shifts > 0 ? (
                              <Badge variant="outline" className="text-amber-500 border-amber-500">
                                {p.unpriced_shifts}
                              </Badge>
                            ) : (
                              '0'
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.total_to_receive > 0 ? (
                              <span className="text-green-600 font-medium">{formatCurrency(p.total_to_receive)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => setSelectedPlantonista(p)}>
                              Ver plantões
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Dialog open={!!selectedPlantonista} onOpenChange={(open) => !open && setSelectedPlantonista(null)}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>
                  {selectedPlantonista?.assignee_name}
                </DialogTitle>
                <DialogDescription>
                  Total: {selectedPlantonista?.total_shifts ?? 0} plantões · Lista: {(selectedPlantonista?.entries ?? []).length} linhas.
                  {' '}"Sem valor definido" quando não há valor atribuído.
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[70vh] overflow-y-auto border rounded">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Horário</TableHead>
                      <TableHead>Setor</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedPlantonista?.entries ?? [])
                      .slice()
                      .sort(
                        (a, b) => a.shift_date.localeCompare(b.shift_date) || (a.start_time || '').localeCompare(b.start_time || '')
                      )
                      .map((e) => {
                        const val = e.value_source === 'invalid' ? null : e.final_value;
                        return (
                          <TableRow key={e.id}>
                            <TableCell>{format(parseISO(e.shift_date), 'dd/MM/yyyy (EEE)', { locale: ptBR })}</TableCell>
                            <TableCell>
                              {e.start_time?.slice(0, 5)} - {e.end_time?.slice(0, 5)}
                            </TableCell>
                            <TableCell>{e.sector_name}</TableCell>
                            <TableCell className="text-right">
                              {val !== null ? (
                                <span className="text-green-600 font-medium">{formatCurrency(val)}</span>
                              ) : (
                                <span className="text-amber-500 text-sm">Sem valor definido</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* TAB: Por Plantonista */}
        <TabsContent value="plantonista" className="space-y-4 mt-4">
          {plantonistaReports.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Nenhum plantão encontrado no período.</p></CardContent></Card>
          ) : (
            plantonistaReports.map(report => {
              const isExpanded = expandedPlantonistas.has(report.assignee_id);
              return (
                <Card key={report.assignee_id}>
                  <div className="flex items-center justify-between p-4 bg-muted/50 cursor-pointer hover:bg-muted/70" onClick={() => togglePlantonista(report.assignee_id)}>
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      <div>
                        <h3 className="font-semibold text-lg">{report.assignee_name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {report.total_shifts} plantões · {report.total_hours.toFixed(1)}h
                          {report.unpriced_shifts > 0 && <span className="text-amber-500 ml-2">({report.unpriced_shifts} sem valor)</span>}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {report.paid_shifts === 0 ? (
                        <Badge variant="outline" className="text-amber-500 border-amber-500">Sem valor</Badge>
                      ) : (
                        <p className="text-xl font-bold text-green-600">{formatCurrency(report.total_to_receive)}</p>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <CardContent className="p-0">
                      {/* Subtotais por setor */}
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Setor</TableHead>
                            <TableHead className="text-center">Plantões</TableHead>
                            <TableHead className="text-center">Horas</TableHead>
                            <TableHead className="text-center">Sem valor</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.sectors.map(s => (
                            <TableRow key={s.sector_id}>
                              <TableCell className="font-medium"><Building className="h-4 w-4 inline mr-2 text-muted-foreground" />{s.sector_name}</TableCell>
                              <TableCell className="text-center">{s.sector_shifts}</TableCell>
                              <TableCell className="text-center">{s.sector_hours.toFixed(1)}h</TableCell>
                              <TableCell className="text-center">{s.sector_unpriced > 0 ? <Badge variant="outline" className="text-amber-500 border-amber-500">{s.sector_unpriced}</Badge> : '0'}</TableCell>
                              <TableCell className="text-right font-medium text-green-600">{s.sector_paid > 0 ? formatCurrency(s.sector_total) : <span className="text-muted-foreground">—</span>}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {/* Lista detalhada de plantões */}
                      <div className="p-4 border-t">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <p className="text-sm font-medium">Detalhamento: ({report.entries.length} plantões)</p>
                          <p className="text-xs text-muted-foreground">Role a lista para ver todos</p>
                        </div>
                        <div className="max-h-[60vh] overflow-y-scroll border rounded">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                              <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Horário</TableHead>
                                <TableHead>Setor</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {report.entries
                                .slice()
                                .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || (a.start_time || '').localeCompare(b.start_time || ''))
                                .map(e => {
                                const val = e.value_source === 'invalid' ? null : e.final_value;
                                return (
                                  <TableRow key={e.id}>
                                    <TableCell>{format(parseISO(e.shift_date), 'dd/MM/yyyy (EEE)', { locale: ptBR })}</TableCell>
                                    <TableCell>{e.start_time?.slice(0, 5)} - {e.end_time?.slice(0, 5)}</TableCell>
                                    <TableCell>{e.sector_name}</TableCell>
                                    <TableCell className="text-right">
                                      {val !== null ? <span className="text-green-600">{formatCurrency(val)}</span> : <Badge variant="outline" className="text-amber-500 border-amber-500">Sem valor</Badge>}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* TAB: Por Setor */}
        <TabsContent value="setor" className="space-y-4 mt-4">
          {sectorReports.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Nenhum plantão encontrado no período.</p></CardContent></Card>
          ) : (
            sectorReports.map(report => {
              const isExpanded = expandedSectors.has(report.sector_id);
              // Agrupar plantões por dia para este setor
              const entriesBySector = filteredEntries.filter(e => e.sector_id === report.sector_id);
              const entriesByDay = entriesBySector.reduce((acc, entry) => {
                const day = entry.shift_date;
                if (!acc[day]) acc[day] = [];
                acc[day].push(entry);
                return acc;
              }, {} as Record<string, typeof entriesBySector>);
              const sortedDays = Object.keys(entriesByDay).sort();
              
              return (
                <Card key={report.sector_id}>
                  <div className="flex items-center justify-between p-4 bg-muted/50 cursor-pointer hover:bg-muted/70" onClick={() => toggleSector(report.sector_id)}>
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      <div>
                        <h3 className="font-semibold text-lg flex items-center gap-2"><Building className="h-5 w-5 text-muted-foreground" />{report.sector_name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {report.total_shifts} plantões · {report.total_hours.toFixed(1)}h · {report.plantonistas.length} plantonista(s)
                          {report.unpriced_shifts > 0 && <span className="text-amber-500 ml-2">({report.unpriced_shifts} sem valor)</span>}
                        </p>
                      </div>
                    </div>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(report.total_value)}</p>
                  </div>
                  {isExpanded && (
                    <CardContent className="p-0">
                      {/* Resumo por plantonista */}
                      <div className="border-b">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead>Plantonista</TableHead>
                              <TableHead className="text-center">Plantões</TableHead>
                              <TableHead className="text-center">Horas</TableHead>
                              <TableHead className="text-center">Sem valor</TableHead>
                              <TableHead className="text-right">Subtotal</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {report.plantonistas.map(p => (
                              <TableRow key={p.assignee_id}>
                                <TableCell className="font-medium">{p.assignee_name}</TableCell>
                                <TableCell className="text-center">{p.shifts}</TableCell>
                                <TableCell className="text-center">{p.hours.toFixed(1)}h</TableCell>
                                <TableCell className="text-center">{p.unpriced > 0 ? <Badge variant="outline" className="text-amber-500 border-amber-500">{p.unpriced}</Badge> : '0'}</TableCell>
                                <TableCell className="text-right font-medium text-green-600">{p.paid > 0 ? formatCurrency(p.value) : <span className="text-muted-foreground">—</span>}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {/* Lista detalhada por dia */}
                      <div className="p-4">
                        <p className="text-sm font-medium mb-3">Plantões por dia:</p>
                        <div className="max-h-[400px] overflow-y-auto border rounded">
                          <div className="space-y-4 p-2">
                            {sortedDays.map(day => {
                              const dayEntries = entriesByDay[day];
                              const dayTotal = dayEntries.reduce((sum, e) => {
                                if (e.value_source !== 'invalid' && e.final_value !== null) {
                                  return sum + e.final_value;
                                }
                                return sum;
                              }, 0);
                              return (
                                <div key={day} className="border rounded-lg overflow-hidden">
                                  <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                                    <span className="font-medium">{format(parseISO(day), "dd/MM/yyyy (EEEE)", { locale: ptBR })}</span>
                                    <span className="text-sm text-green-600 font-medium">{dayTotal > 0 ? formatCurrency(dayTotal) : ''}</span>
                                  </div>
                                  <Table>
                                    <TableBody>
                                      {dayEntries.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')).map(e => {
                                        const val = e.value_source === 'invalid' ? null : e.final_value;
                                        return (
                                          <TableRow key={e.id}>
                                            <TableCell className="w-32">{e.start_time?.slice(0, 5)} - {e.end_time?.slice(0, 5)}</TableCell>
                                            <TableCell>{e.assignee_name}</TableCell>
                                            <TableCell className="text-right w-32">
                                              {val !== null ? <span className="text-green-600">{formatCurrency(val)}</span> : <Badge variant="outline" className="text-amber-500 border-amber-500">Sem valor</Badge>}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* TAB: Todos os Plantões */}
        <TabsContent value="todos" className="mt-4">
          {filteredEntries.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Nenhum plantão encontrado no período.</p></CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="h-[calc(100vh-400px)] min-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Horário</TableHead>
                        <TableHead className="text-center">Duração</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead>Plantonista</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.sort((a, b) => new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime()).map(e => {
                        const val = e.value_source === 'invalid' ? null : e.final_value;
                        return (
                          <TableRow key={e.id}>
                            <TableCell>{format(parseISO(e.shift_date), 'dd/MM/yyyy (EEE)', { locale: ptBR })}</TableCell>
                            <TableCell>{e.start_time?.slice(0, 5)} - {e.end_time?.slice(0, 5)}</TableCell>
                            <TableCell className="text-center"><Badge variant="outline">{e.duration_hours.toFixed(1)}h</Badge></TableCell>
                            <TableCell>{e.sector_name}</TableCell>
                            <TableCell>{e.assignee_name}</TableCell>
                            <TableCell className="text-right">
                              {val !== null ? <span className="font-medium text-green-600">{formatCurrency(val)}</span> : <Badge variant="outline" className="text-amber-500 border-amber-500">Sem valor</Badge>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Grand Total Card */}
      {filteredEntries.length > 0 && (
        <Card className="border-2 border-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">TOTAL GERAL</p>
                <p className="text-sm text-muted-foreground">
                  {grandTotals.totalPlantonistas} plantonistas · {grandTotals.totalShifts} plantões · {grandTotals.totalHours.toFixed(1)}h
                  {grandTotals.unpricedShifts > 0 && <span className="text-amber-500 ml-2">· {grandTotals.unpricedShifts} sem valor</span>}
                </p>
              </div>
              <p className="text-3xl font-bold text-green-600">{formatCurrency(grandTotals.totalValue)}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
