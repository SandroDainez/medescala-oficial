import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { useSyncShiftEntries } from '@/hooks/useSyncShiftEntries';
import { Download, DollarSign, Users, Calendar, Filter, ChevronDown, ChevronRight, Building, AlertCircle, FileText, Printer, RefreshCw } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Interfaces para o modelo de dados
interface ShiftEntry {
  id: string;
  setor_id: string;
  setor_name: string;
  data: string; // YYYY-MM-DD
  plantonista_id: string;
  plantonista_name: string;
  valor: number | null;
  status_valor: 'COM_VALOR' | 'SEM_VALOR';
  horario?: string;
  duracao_horas?: number;
}

interface SectorSummary {
  setor_id: string;
  setor_name: string;
  total_valor: number;
  count_com_valor: number;
  count_sem_valor: number;
  entries: ShiftEntry[];
}

interface PlantonistaReport {
  plantonista_id: string;
  plantonista_name: string;
  setores: SectorSummary[];
  total_geral: number;
  total_plantoes: number;
  total_sem_valor: number;
}

interface Sector {
  id: string;
  name: string;
}

interface Plantonista {
  id: string;
  name: string;
}

export default function AdminFinancial() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const { syncAndNotify } = useSyncShiftEntries();
  
  // States
  const [shiftEntries, setShiftEntries] = useState<ShiftEntry[]>([]);
  const [reports, setReports] = useState<PlantonistaReport[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [plantonistas, setPlantonistas] = useState<Plantonista[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Filtros
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterSetor, setFilterSetor] = useState<string>('all');
  const [filterPlantonista, setFilterPlantonista] = useState<string>('all');
  
  // Expanded state
  const [expandedPlantonistas, setExpandedPlantonistas] = useState<Set<string>>(new Set());
  const [expandedSetores, setExpandedSetores] = useState<Set<string>>(new Set());

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

  function setLast30Days() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    setStartDate(format(thirtyDaysAgo, 'yyyy-MM-dd'));
    setEndDate(format(today, 'yyyy-MM-dd'));
  }

  useEffect(() => {
    if (currentTenantId) {
      fetchData();
    }
  }, [currentTenantId, startDate, endDate]);

  async function handleSync() {
    if (!currentTenantId) return;
    setSyncing(true);
    try {
      await syncAndNotify(currentTenantId, startDate, endDate);
      await fetchData();
    } catch (e) {
      // Error already shown by syncAndNotify
    } finally {
      setSyncing(false);
    }
  }

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);

    // Fetch sectors
    const { data: sectorsData } = await supabase
      .from('sectors')
      .select('id, name')
      .eq('tenant_id', currentTenantId)
      .eq('active', true);
    
    setSectors(sectorsData || []);

    // Fetch plantonistas (members)
    const { data: membersData } = await supabase
      .from('memberships')
      .select('user_id, profile:profiles!memberships_user_id_profiles_fkey(id, name)')
      .eq('tenant_id', currentTenantId)
      .eq('active', true);
    
    const plantonistasList = (membersData || []).map((m: any) => ({
      id: m.user_id,
      name: m.profile?.name || 'N/A'
    }));
    setPlantonistas(plantonistasList);

    // First try to fetch from shift_entries table
    const { data: entriesData, error: entriesError } = await supabase
      .from('shift_entries')
      .select(`
        id,
        setor_id,
        data,
        plantonista_id,
        valor,
        status_valor,
        sector:sectors!shift_entries_setor_id_fkey(id, name),
        profile:profiles!shift_entries_plantonista_id_fkey(id, name)
      `)
      .eq('tenant_id', currentTenantId)
      .gte('data', startDate)
      .lte('data', endDate);

    let entries: ShiftEntry[] = [];

    if (!entriesError && entriesData && entriesData.length > 0) {
      // Use data from shift_entries table
      entries = entriesData.map((e: any) => ({
        id: e.id,
        setor_id: e.setor_id,
        setor_name: e.sector?.name || 'Sem Setor',
        data: e.data,
        plantonista_id: e.plantonista_id,
        plantonista_name: e.profile?.name || 'N/A',
        valor: e.valor !== null ? Number(e.valor) : null,
        status_valor: e.status_valor as 'COM_VALOR' | 'SEM_VALOR',
      }));
    } else {
      // Fallback: read directly from shift_assignments + shifts
      const { data: shiftsInRange } = await supabase
        .from('shifts')
        .select('id')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', startDate)
        .lte('shift_date', endDate);

      const shiftIds = shiftsInRange?.map(s => s.id) || [];

      if (shiftIds.length > 0) {
        const { data: assignments } = await supabase
          .from('shift_assignments')
          .select(`
            id,
            shift_id,
            user_id,
            assigned_value,
            profile:profiles!shift_assignments_user_id_profiles_fkey(id, name),
            shift:shifts!inner(
              id,
              shift_date,
              start_time,
              end_time,
              base_value,
              sector_id,
              sector:sectors(id, name)
            )
          `)
          .eq('tenant_id', currentTenantId)
          .in('shift_id', shiftIds);

        entries = (assignments || []).map((a: any) => {
          const assignedVal = Number(a.assigned_value) || 0;
          const baseVal = Number(a.shift?.base_value) || 0;
          const finalValue = assignedVal > 0 ? assignedVal : (baseVal > 0 ? baseVal : null);
          
          return {
            id: a.id,
            setor_id: a.shift?.sector?.id || a.shift?.sector_id || '',
            setor_name: a.shift?.sector?.name || 'Sem Setor',
            data: a.shift?.shift_date,
            plantonista_id: a.user_id,
            plantonista_name: a.profile?.name || 'N/A',
            valor: finalValue,
            status_valor: (finalValue !== null ? 'COM_VALOR' : 'SEM_VALOR') as 'COM_VALOR' | 'SEM_VALOR',
            horario: `${a.shift?.start_time?.slice(0, 5) || ''} - ${a.shift?.end_time?.slice(0, 5) || ''}`,
          };
        });
      }
    }

    setShiftEntries(entries);

    // Build reports grouped by plantonista and sector
    const reportMap = new Map<string, PlantonistaReport>();

    entries.forEach(entry => {
      if (!reportMap.has(entry.plantonista_id)) {
        reportMap.set(entry.plantonista_id, {
          plantonista_id: entry.plantonista_id,
          plantonista_name: entry.plantonista_name,
          setores: [],
          total_geral: 0,
          total_plantoes: 0,
          total_sem_valor: 0
        });
      }
      
      const report = reportMap.get(entry.plantonista_id)!;
      
      let sectorSummary = report.setores.find(s => s.setor_id === entry.setor_id);
      if (!sectorSummary) {
        sectorSummary = {
          setor_id: entry.setor_id || 'sem-setor',
          setor_name: entry.setor_name,
          total_valor: 0,
          count_com_valor: 0,
          count_sem_valor: 0,
          entries: []
        };
        report.setores.push(sectorSummary);
      }
      
      sectorSummary.entries.push(entry);
      
      if (entry.valor !== null) {
        sectorSummary.total_valor += entry.valor;
        sectorSummary.count_com_valor++;
        report.total_geral += entry.valor;
      } else {
        sectorSummary.count_sem_valor++;
        report.total_sem_valor++;
      }
      
      report.total_plantoes++;
    });

    // Sort entries by date within each sector
    reportMap.forEach(report => {
      report.setores.forEach(sector => {
        sector.entries.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
      });
      report.setores.sort((a, b) => b.total_valor - a.total_valor);
    });

    const reportsArray = Array.from(reportMap.values())
      .sort((a, b) => a.plantonista_name.localeCompare(b.plantonista_name));

    setReports(reportsArray);
    setLoading(false);
  }

  // Filtered reports based on filters
  const filteredReports = useMemo(() => {
    let result = reports;
    
    if (filterPlantonista !== 'all') {
      result = result.filter(r => r.plantonista_id === filterPlantonista);
    }
    
    if (filterSetor !== 'all') {
      result = result.map(r => ({
        ...r,
        setores: r.setores.filter(s => s.setor_id === filterSetor)
      })).filter(r => r.setores.length > 0);
      
      result = result.map(r => ({
        ...r,
        total_geral: r.setores.reduce((acc, s) => acc + s.total_valor, 0),
        total_plantoes: r.setores.reduce((acc, s) => acc + s.entries.length, 0),
        total_sem_valor: r.setores.reduce((acc, s) => acc + s.count_sem_valor, 0)
      }));
    }
    
    return result;
  }, [reports, filterPlantonista, filterSetor]);

  // Grand totals
  const grandTotals = useMemo(() => {
    return {
      total_valor: filteredReports.reduce((acc, r) => acc + r.total_geral, 0),
      total_plantoes: filteredReports.reduce((acc, r) => acc + r.total_plantoes, 0),
      total_sem_valor: filteredReports.reduce((acc, r) => acc + r.total_sem_valor, 0),
      total_plantonistas: filteredReports.length
    };
  }, [filteredReports]);

  function togglePlantonista(id: string) {
    setExpandedPlantonistas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }

  function toggleSetor(key: string) {
    setExpandedSetores(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  }

  function expandAll() {
    const allPlantonistas = new Set(filteredReports.map(r => r.plantonista_id));
    const allSetores = new Set<string>();
    filteredReports.forEach(r => {
      r.setores.forEach(s => {
        allSetores.add(`${r.plantonista_id}-${s.setor_id}`);
      });
    });
    setExpandedPlantonistas(allPlantonistas);
    setExpandedSetores(allSetores);
  }

  function collapseAll() {
    setExpandedPlantonistas(new Set());
    setExpandedSetores(new Set());
  }

  function exportCSV() {
    const headers = ['Plantonista', 'Setor', 'Data', 'Valor', 'Status'];
    const rows: string[][] = [];

    filteredReports.forEach(report => {
      report.setores.forEach(sector => {
        sector.entries.forEach(entry => {
          rows.push([
            entry.plantonista_name,
            entry.setor_name,
            format(parseISO(entry.data), 'dd/MM/yyyy'),
            entry.valor !== null ? entry.valor.toFixed(2) : '',
            entry.status_valor === 'COM_VALOR' ? 'Com valor' : 'Sem valor'
          ]);
        });
        rows.push([
          '',
          `SUBTOTAL ${sector.setor_name}`,
          '',
          sector.total_valor.toFixed(2),
          `(${sector.count_sem_valor} sem valor)`
        ]);
      });
      rows.push([
        `TOTAL ${report.plantonista_name}`,
        '',
        '',
        report.total_geral.toFixed(2),
        ''
      ]);
      rows.push(['', '', '', '', '']);
    });

    rows.push(['TOTAL GERAL', '', '', grandTotals.total_valor.toFixed(2), '']);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-${startDate}-a-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatCurrency(value: number | null): string {
    if (value === null) return '';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

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
          <p className="text-muted-foreground">Relatório detalhado por plantonista e setor</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
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
          {/* Date Range */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label>Data Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={setThisMonth}>Este mês</Button>
              <Button variant="outline" size="sm" onClick={setLastMonth}>Mês anterior</Button>
              <Button variant="outline" size="sm" onClick={setLast30Days}>Últimos 30 dias</Button>
            </div>
          </div>

          {/* Other Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5 min-w-[200px]">
              <Label>Setor</Label>
              <Select value={filterSetor} onValueChange={setFilterSetor}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os setores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os setores</SelectItem>
                  {sectors.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
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
                  {plantonistas.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Plantonistas</p>
                <p className="text-2xl font-bold">{grandTotals.total_plantonistas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Plantões</p>
                <p className="text-2xl font-bold">{grandTotals.total_plantoes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sem Valor</p>
                <p className="text-2xl font-bold">{grandTotals.total_sem_valor}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Geral</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(grandTotals.total_valor)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={expandAll}>Expandir Todos</Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>Recolher Todos</Button>
      </div>

      {/* Reports by Plantonista */}
      {filteredReports.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum plantão encontrado no período selecionado.</p>
            <p className="text-sm mt-2">Clique em "Sincronizar" para atualizar os dados das escalas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredReports.map(report => (
            <Card key={report.plantonista_id} className="overflow-hidden">
              {/* Plantonista Header */}
              <div
                className="flex items-center justify-between p-4 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={() => togglePlantonista(report.plantonista_id)}
              >
                <div className="flex items-center gap-3">
                  {expandedPlantonistas.has(report.plantonista_id) 
                    ? <ChevronDown className="h-5 w-5" />
                    : <ChevronRight className="h-5 w-5" />
                  }
                  <div>
                    <h3 className="font-semibold text-lg">{report.plantonista_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {report.total_plantoes} plantões em {report.setores.length} setor(es)
                      {report.total_sem_valor > 0 && (
                        <span className="text-amber-500 ml-2">
                          ({report.total_sem_valor} sem valor)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-green-600">{formatCurrency(report.total_geral)}</p>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedPlantonistas.has(report.plantonista_id) && (
                <CardContent className="p-0">
                  {report.setores.map(sector => {
                    const sectorKey = `${report.plantonista_id}-${sector.setor_id}`;
                    const isExpanded = expandedSetores.has(sectorKey);
                    
                    return (
                      <div key={sector.setor_id} className="border-t">
                        {/* Sector Header */}
                        <div
                          className="flex items-center justify-between p-3 pl-8 bg-background cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleSetor(sectorKey)}
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />
                            }
                            <Building className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{sector.setor_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {sector.entries.length} plantões
                                {sector.count_sem_valor > 0 && (
                                  <span className="text-amber-500 ml-1">
                                    ({sector.count_sem_valor} sem valor)
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-green-600 bg-green-100">
                            {formatCurrency(sector.total_valor)}
                          </Badge>
                        </div>

                        {/* Shift Details Table */}
                        {isExpanded && (
                          <div className="pl-12 pr-4 pb-4">
                            <ScrollArea className="max-h-[400px]">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-[120px]">Data</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {sector.entries.map(entry => (
                                    <TableRow key={entry.id}>
                                      <TableCell className="font-medium">
                                        {format(parseISO(entry.data), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {entry.valor !== null ? (
                                          <span className="font-medium text-green-600">
                                            {formatCurrency(entry.valor)}
                                          </span>
                                        ) : (
                                          <Badge variant="outline" className="text-amber-500 border-amber-500">
                                            Sem valor atribuído
                                          </Badge>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  {/* Sector Total Row */}
                                  <TableRow className="bg-muted/30 font-medium">
                                    <TableCell className="text-right">
                                      Subtotal {sector.setor_name}
                                      {sector.count_sem_valor > 0 && (
                                        <span className="text-amber-500 font-normal ml-2">
                                          ({sector.count_sem_valor} sem valor)
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right text-green-600">
                                      {formatCurrency(sector.total_valor)}
                                    </TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Plantonista Total Summary */}
                  {report.setores.length > 1 && (
                    <div className="border-t p-4 bg-muted/20">
                      <div className="space-y-2">
                        <p className="font-semibold text-sm text-muted-foreground">Resumo por Setor:</p>
                        <div className="grid gap-2">
                          {report.setores.map(sector => (
                            <div key={sector.setor_id} className="flex justify-between text-sm pl-4">
                              <span>{sector.setor_name}</span>
                              <span className="font-medium">
                                {formatCurrency(sector.total_valor)}
                                {sector.count_sem_valor > 0 && (
                                  <span className="text-amber-500 ml-2">
                                    ({sector.count_sem_valor} sem valor)
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                        <Separator />
                        <div className="flex justify-between font-bold">
                          <span>Total Geral {report.plantonista_name}</span>
                          <span className="text-green-600">{formatCurrency(report.total_geral)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Grand Total Card */}
      {filteredReports.length > 0 && (
        <Card className="border-2 border-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">TOTAL GERAL</p>
                <p className="text-sm text-muted-foreground">
                  {grandTotals.total_plantonistas} plantonistas · {grandTotals.total_plantoes} plantões
                  {grandTotals.total_sem_valor > 0 && (
                    <span className="text-amber-500 ml-2">
                      · {grandTotals.total_sem_valor} sem valor atribuído
                    </span>
                  )}
                </p>
              </div>
              <p className="text-3xl font-bold text-green-600">{formatCurrency(grandTotals.total_valor)}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
