import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Download, DollarSign, Users, Calendar, Filter, ChevronDown, ChevronRight, Building, AlertCircle, FileText, Printer, Clock, Eye } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, differenceInHours, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ============================================================
// INTERFACES - Modelo de Dados
// ============================================================
interface RawShiftEntry {
  id: string;                    // shift_assignment.id
  shift_id: string;
  shift_date: string;            // YYYY-MM-DD (fonte: shifts.shift_date)
  start_time: string;
  end_time: string;
  sector_id: string | null;
  sector_name: string;
  assignee_id: string;           // user_id da atribuição
  assignee_name: string;
  assigned_value: number | null; // valor atribuído (pode ser null)
  base_value: number | null;     // valor base do plantão (pode ser null)
  duration_hours: number;        // calculado de start_time/end_time
}

interface PlantonistaReport {
  assignee_id: string;
  assignee_name: string;
  total_shifts: number;
  total_hours: number;
  paid_shifts: number;
  unpriced_shifts: number;
  total_to_receive: number;      // soma só dos valores != null
  sectors: SectorSubtotal[];
  entries: RawShiftEntry[];
}

interface SectorSubtotal {
  sector_id: string;
  sector_name: string;
  sector_shifts: number;
  sector_hours: number;
  sector_paid: number;
  sector_unpriced: number;
  sector_total: number;
}

interface SectorReport {
  sector_id: string;
  sector_name: string;
  total_shifts: number;
  total_hours: number;
  paid_shifts: number;
  unpriced_shifts: number;
  total_value: number;
  plantonistas: {
    assignee_id: string;
    assignee_name: string;
    shifts: number;
    hours: number;
    paid: number;
    unpriced: number;
    value: number;
  }[];
}

interface AuditData {
  totalLoaded: number;
  withValue: number;
  withoutValue: number;
  invalidValue: number;
  sumDetails: { id: string; assignee: string; value: number }[];
  finalSum: number;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function calculateDurationHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let hours = endH - startH;
  let minutes = endM - startM;
  if (hours < 0 || (hours === 0 && minutes < 0)) {
    hours += 24; // overnight shift
  }
  return hours + minutes / 60;
}

function getFinalValue(assignedValue: number | null, baseValue: number | null): number | null {
  // REGRA: assigned_value tem prioridade. Se null/0, usa base_value. Se ambos null, retorna null.
  if (assignedValue !== null && assignedValue > 0) return assignedValue;
  if (baseValue !== null && baseValue > 0) return baseValue;
  return null;
}

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

    // FONTE DE VERDADE: shifts + shift_assignments (JOIN)
    const { data: assignments, error } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        user_id,
        assigned_value,
        shift:shifts!inner(
          id,
          shift_date,
          start_time,
          end_time,
          base_value,
          sector_id,
          sector:sectors(id, name)
        ),
        profile:profiles!shift_assignments_user_id_profiles_fkey(id, name)
      `)
      .eq('tenant_id', currentTenantId)
      .gte('shift.shift_date', startDate)
      .lte('shift.shift_date', endDate);

    if (error) {
      console.error('[AdminFinancial] Fetch error:', error);
      setRawEntries([]);
      setLoading(false);
      return;
    }

    const entries: RawShiftEntry[] = (assignments || []).map((a: any) => {
      const shift = a.shift;
      const assignedVal = a.assigned_value !== null ? Number(a.assigned_value) : null;
      const baseVal = shift?.base_value !== null ? Number(shift.base_value) : null;
      const duration = calculateDurationHours(shift?.start_time || '', shift?.end_time || '');

      return {
        id: a.id,
        shift_id: shift?.id || '',
        shift_date: shift?.shift_date || '',
        start_time: shift?.start_time || '',
        end_time: shift?.end_time || '',
        sector_id: shift?.sector?.id || shift?.sector_id || null,
        sector_name: shift?.sector?.name || 'Sem Setor',
        assignee_id: a.user_id,
        assignee_name: a.profile?.name || 'N/A',
        assigned_value: assignedVal,
        base_value: baseVal,
        duration_hours: duration,
      };
    });

    console.log(`[AdminFinancial] Loaded ${entries.length} entries from DB`);
    setRawEntries(entries);
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
  // AGGREGATIONS
  // ============================================================

  // AUDIT DATA
  const auditData = useMemo((): AuditData => {
    let withValue = 0;
    let withoutValue = 0;
    let invalidValue = 0;
    const sumDetails: { id: string; assignee: string; value: number }[] = [];
    let finalSum = 0;

    filteredEntries.forEach(e => {
      const val = getFinalValue(e.assigned_value, e.base_value);
      if (val === null) {
        withoutValue++;
      } else if (val < 0 || isNaN(val)) {
        invalidValue++;
      } else {
        withValue++;
        sumDetails.push({ id: e.id, assignee: e.assignee_name, value: val });
        finalSum += val;
      }
    });

    return {
      totalLoaded: filteredEntries.length,
      withValue,
      withoutValue,
      invalidValue,
      sumDetails,
      finalSum,
    };
  }, [filteredEntries]);

  // POR PLANTONISTA (agrupado por assignee_id)
  const plantonistaReports = useMemo((): PlantonistaReport[] => {
    const map = new Map<string, PlantonistaReport>();

    filteredEntries.forEach(e => {
      if (!map.has(e.assignee_id)) {
        map.set(e.assignee_id, {
          assignee_id: e.assignee_id,
          assignee_name: e.assignee_name,
          total_shifts: 0,
          total_hours: 0,
          paid_shifts: 0,
          unpriced_shifts: 0,
          total_to_receive: 0,
          sectors: [],
          entries: [],
        });
      }

      const report = map.get(e.assignee_id)!;
      const val = getFinalValue(e.assigned_value, e.base_value);

      report.total_shifts++;
      report.total_hours += e.duration_hours;
      report.entries.push(e);

      if (val !== null && val >= 0) {
        report.paid_shifts++;
        report.total_to_receive += val;
      } else {
        report.unpriced_shifts++;
      }
    });

    // Build sector subtotals for each plantonista
    map.forEach(report => {
      const sectorMap = new Map<string, SectorSubtotal>();

      report.entries.forEach(e => {
        const sectorId = e.sector_id || 'sem-setor';
        if (!sectorMap.has(sectorId)) {
          sectorMap.set(sectorId, {
            sector_id: sectorId,
            sector_name: e.sector_name,
            sector_shifts: 0,
            sector_hours: 0,
            sector_paid: 0,
            sector_unpriced: 0,
            sector_total: 0,
          });
        }
        const sub = sectorMap.get(sectorId)!;
        const val = getFinalValue(e.assigned_value, e.base_value);
        sub.sector_shifts++;
        sub.sector_hours += e.duration_hours;
        if (val !== null && val >= 0) {
          sub.sector_paid++;
          sub.sector_total += val;
        } else {
          sub.sector_unpriced++;
        }
      });

      report.sectors = Array.from(sectorMap.values()).sort((a, b) => a.sector_name.localeCompare(b.sector_name));
      report.entries.sort((a, b) => new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime());
    });

    return Array.from(map.values()).sort((a, b) => a.assignee_name.localeCompare(b.assignee_name));
  }, [filteredEntries]);

  // POR SETOR (agrupado por sector_id)
  const sectorReports = useMemo((): SectorReport[] => {
    const map = new Map<string, SectorReport>();

    filteredEntries.forEach(e => {
      const sectorId = e.sector_id || 'sem-setor';
      if (!map.has(sectorId)) {
        map.set(sectorId, {
          sector_id: sectorId,
          sector_name: e.sector_name,
          total_shifts: 0,
          total_hours: 0,
          paid_shifts: 0,
          unpriced_shifts: 0,
          total_value: 0,
          plantonistas: [],
        });
      }

      const report = map.get(sectorId)!;
      const val = getFinalValue(e.assigned_value, e.base_value);

      report.total_shifts++;
      report.total_hours += e.duration_hours;

      if (val !== null && val >= 0) {
        report.paid_shifts++;
        report.total_value += val;
      } else {
        report.unpriced_shifts++;
      }
    });

    // Build plantonistas subtotals for each sector
    map.forEach((report, sectorId) => {
      const plantMap = new Map<string, { assignee_id: string; assignee_name: string; shifts: number; hours: number; paid: number; unpriced: number; value: number }>();

      filteredEntries.filter(e => (e.sector_id || 'sem-setor') === sectorId).forEach(e => {
        if (!plantMap.has(e.assignee_id)) {
          plantMap.set(e.assignee_id, { assignee_id: e.assignee_id, assignee_name: e.assignee_name, shifts: 0, hours: 0, paid: 0, unpriced: 0, value: 0 });
        }
        const p = plantMap.get(e.assignee_id)!;
        const val = getFinalValue(e.assigned_value, e.base_value);
        p.shifts++;
        p.hours += e.duration_hours;
        if (val !== null && val >= 0) {
          p.paid++;
          p.value += val;
        } else {
          p.unpriced++;
        }
      });

      report.plantonistas = Array.from(plantMap.values()).sort((a, b) => a.assignee_name.localeCompare(b.assignee_name));
    });

    return Array.from(map.values()).sort((a, b) => a.sector_name.localeCompare(b.sector_name));
  }, [filteredEntries]);

  // GRAND TOTALS
  const grandTotals = useMemo(() => {
    let totalShifts = 0;
    let totalHours = 0;
    let paidShifts = 0;
    let unpricedShifts = 0;
    let totalValue = 0;

    filteredEntries.forEach(e => {
      const val = getFinalValue(e.assigned_value, e.base_value);
      totalShifts++;
      totalHours += e.duration_hours;
      if (val !== null && val >= 0) {
        paidShifts++;
        totalValue += val;
      } else {
        unpricedShifts++;
      }
    });

    return { totalShifts, totalHours, paidShifts, unpricedShifts, totalValue, totalPlantonistas: plantonistaReports.length };
  }, [filteredEntries, plantonistaReports]);

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
      const val = getFinalValue(e.assigned_value, e.base_value);
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
              <div>
                <p className="text-sm text-muted-foreground">Plantonistas</p>
                <p className="text-2xl font-bold">{grandTotals.totalPlantonistas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Calendar className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Plantões</p>
                <p className="text-2xl font-bold">{grandTotals.totalShifts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg"><Clock className="h-5 w-5 text-purple-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Horas</p>
                <p className="text-2xl font-bold">{grandTotals.totalHours.toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg"><AlertCircle className="h-5 w-5 text-amber-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Sem Valor</p>
                <p className="text-2xl font-bold">{grandTotals.unpricedShifts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg"><DollarSign className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Geral</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(grandTotals.totalValue)}</p>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="font-medium">Total carregado:</span> {auditData.totalLoaded}</div>
              <div><span className="font-medium text-green-600">Com valor:</span> {auditData.withValue}</div>
              <div><span className="font-medium text-amber-600">Sem valor:</span> {auditData.withoutValue}</div>
              <div><span className="font-medium text-red-600">Valor inválido:</span> {auditData.invalidValue}</div>
            </div>
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
                        <TableCell>{d.assignee}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(d.value)}</TableCell>
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

      {/* TABS: Por Plantonista | Por Setor | Todos os Plantões */}
      <Tabs defaultValue="plantonista" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="plantonista">Por Plantonista</TabsTrigger>
          <TabsTrigger value="setor">Por Setor</TabsTrigger>
          <TabsTrigger value="todos">Todos os Plantões</TabsTrigger>
        </TabsList>

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
                        <p className="text-sm font-medium mb-2">Detalhamento:</p>
                        <ScrollArea className="max-h-[300px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Horário</TableHead>
                                <TableHead>Setor</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {report.entries.map(e => {
                                const val = getFinalValue(e.assigned_value, e.base_value);
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
                        </ScrollArea>
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
                <ScrollArea className="max-h-[600px]">
                  <Table>
                    <TableHeader>
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
                        const val = getFinalValue(e.assigned_value, e.base_value);
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
                </ScrollArea>
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
