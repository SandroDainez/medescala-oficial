import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
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

interface PlantonistaSectorSummary {
  plantonista_id: string;
  plantonista_name: string;
  total_valor: number;
  total_plantoes: number;
  total_sem_valor: number;
  entries: ShiftEntry[];
}

interface SectorReport {
  setor_id: string;
  setor_name: string;
  total_valor: number;
  total_plantoes: number;
  total_sem_valor: number;
  plantonistas: PlantonistaSectorSummary[];
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
  const { currentTenantId } = useTenant();
  const { syncAndNotify } = useSyncShiftEntries();
  
  // States
  const [shiftEntries, setShiftEntries] = useState<ShiftEntry[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [plantonistas, setPlantonistas] = useState<Plantonista[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Filtros
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterSetor, setFilterSetor] = useState<string>('all');
  const [filterPlantonista, setFilterPlantonista] = useState<string>('all');
  
  // Expanded state (setor -> plantonista)
  const [expandedSetores, setExpandedSetores] = useState<Set<string>>(new Set());
  const [expandedPlantonistas, setExpandedPlantonistas] = useState<Set<string>>(new Set());

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

    setShiftEntries(entries);
    setLoading(false);
  }

  const filteredEntries = useMemo(() => {
    return shiftEntries.filter((e) => {
      if (filterPlantonista !== 'all' && e.plantonista_id !== filterPlantonista) return false;
      if (filterSetor !== 'all' && e.setor_id !== filterSetor) return false;
      return true;
    });
  }, [shiftEntries, filterPlantonista, filterSetor]);

  const sectorReports = useMemo((): SectorReport[] => {
    const sectorMap = new Map<string, SectorReport>();

    filteredEntries.forEach((entry) => {
      const setorId = entry.setor_id || 'sem-setor';
      const setorName = entry.setor_name || 'Sem Setor';

      if (!sectorMap.has(setorId)) {
        sectorMap.set(setorId, {
          setor_id: setorId,
          setor_name: setorName,
          total_valor: 0,
          total_plantoes: 0,
          total_sem_valor: 0,
          plantonistas: [],
        });
      }

      const sector = sectorMap.get(setorId)!;
      let plant = sector.plantonistas.find((p) => p.plantonista_id === entry.plantonista_id);

      if (!plant) {
        plant = {
          plantonista_id: entry.plantonista_id,
          plantonista_name: entry.plantonista_name,
          total_valor: 0,
          total_plantoes: 0,
          total_sem_valor: 0,
          entries: [],
        };
        sector.plantonistas.push(plant);
      }

      plant.entries.push(entry);
      plant.total_plantoes += 1;
      sector.total_plantoes += 1;

      if (entry.valor !== null) {
        const v = Number(entry.valor);
        plant.total_valor += v;
        sector.total_valor += v;
      } else {
        plant.total_sem_valor += 1;
        sector.total_sem_valor += 1;
      }
    });

    // sort
    sectorMap.forEach((sector) => {
      sector.plantonistas.forEach((p) => {
        p.entries.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
      });
      sector.plantonistas.sort((a, b) => a.plantonista_name.localeCompare(b.plantonista_name));
    });

    return Array.from(sectorMap.values()).sort((a, b) => a.setor_name.localeCompare(b.setor_name));
  }, [filteredEntries]);

  const plantonistaTotals = useMemo(() => {
    const map = new Map<string, { plantonista_id: string; plantonista_name: string; total_plantoes: number; total_sem_valor: number; total_valor: number }>();

    filteredEntries.forEach((e) => {
      if (!map.has(e.plantonista_id)) {
        map.set(e.plantonista_id, {
          plantonista_id: e.plantonista_id,
          plantonista_name: e.plantonista_name,
          total_plantoes: 0,
          total_sem_valor: 0,
          total_valor: 0,
        });
      }
      const row = map.get(e.plantonista_id)!;
      row.total_plantoes += 1;
      if (e.valor !== null) row.total_valor += Number(e.valor);
      else row.total_sem_valor += 1;
    });

    return Array.from(map.values()).sort((a, b) => a.plantonista_name.localeCompare(b.plantonista_name));
  }, [filteredEntries]);

  const grandTotals = useMemo(() => {
    return {
      total_valor: plantonistaTotals.reduce((acc, r) => acc + r.total_valor, 0),
      total_plantoes: plantonistaTotals.reduce((acc, r) => acc + r.total_plantoes, 0),
      total_sem_valor: plantonistaTotals.reduce((acc, r) => acc + r.total_sem_valor, 0),
      total_plantonistas: plantonistaTotals.length,
    };
  }, [plantonistaTotals]);

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
    const allSetores = new Set<string>(sectorReports.map((s) => s.setor_id));
    const allPlantonistas = new Set<string>();
    sectorReports.forEach((s) => {
      s.plantonistas.forEach((p) => allPlantonistas.add(`${s.setor_id}-${p.plantonista_id}`));
    });
    setExpandedSetores(allSetores);
    setExpandedPlantonistas(allPlantonistas);
  }

  function collapseAll() {
    setExpandedSetores(new Set<string>());
    setExpandedPlantonistas(new Set<string>());
  }

  function exportCSV() {
    const headers = ['Setor', 'Plantonista', 'Data', 'Valor', 'Status'];

    const sorted = [...filteredEntries].sort((a, b) => {
      const setor = a.setor_name.localeCompare(b.setor_name);
      if (setor !== 0) return setor;
      const pl = a.plantonista_name.localeCompare(b.plantonista_name);
      if (pl !== 0) return pl;
      return new Date(a.data).getTime() - new Date(b.data).getTime();
    });

    const rows: string[][] = sorted.map((e) => [
      e.setor_name,
      e.plantonista_name,
      format(parseISO(e.data), 'dd/MM/yyyy'),
      e.valor !== null ? Number(e.valor).toFixed(2) : '',
      e.status_valor === 'COM_VALOR' ? 'Com valor' : 'Sem valor',
    ]);

    rows.push(['TOTAL GERAL', '', '', grandTotals.total_valor.toFixed(2), '']);

    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
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

      {/* Relatório por Setor (tabela separada por plantonista) */}
      {sectorReports.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum plantão encontrado no período selecionado.</p>
            <p className="text-sm mt-2">Clique em "Sincronizar" para atualizar os dados das escalas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sectorReports.map((sector) => {
            const setorId = sector.setor_id;
            const setorExpanded = expandedSetores.has(setorId);

            return (
              <Card key={setorId} className="overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => toggleSetor(setorId)}
                >
                  <div className="flex items-center gap-3">
                    {setorExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <div>
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Building className="h-5 w-5 text-muted-foreground" />
                        {sector.setor_name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {sector.total_plantoes} plantões · {sector.plantonistas.length} plantonista(s)
                        {sector.total_sem_valor > 0 && (
                          <span className="text-amber-500 ml-2">({sector.total_sem_valor} sem valor)</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-600">{formatCurrency(sector.total_valor)}</p>
                  </div>
                </div>

                {setorExpanded && (
                  <CardContent className="p-0">
                    {sector.plantonistas.map((p) => {
                      const key = `${setorId}-${p.plantonista_id}`;
                      const expanded = expandedPlantonistas.has(key);

                      return (
                        <div key={p.plantonista_id} className="border-t">
                          <div
                            className="flex items-center justify-between p-3 pl-8 bg-background cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => togglePlantonista(key)}
                          >
                            <div className="flex items-center gap-3">
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <div>
                                <p className="font-medium">{p.plantonista_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {p.total_plantoes} plantões
                                  {p.total_sem_valor > 0 && (
                                    <span className="text-amber-500 ml-1">({p.total_sem_valor} sem valor)</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <Badge variant="secondary" className="text-green-600 bg-green-100">
                              {formatCurrency(p.total_valor)}
                            </Badge>
                          </div>

                          {expanded && (
                            <div className="pl-12 pr-4 pb-4">
                              <ScrollArea className="max-h-[400px]">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[160px]">Data</TableHead>
                                      <TableHead className="text-right">Valor</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {p.entries.map((entry) => (
                                      <TableRow key={entry.id}>
                                        <TableCell className="font-medium">
                                          {format(parseISO(entry.data), 'dd/MM/yyyy (EEEE)', { locale: ptBR })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {entry.valor !== null ? (
                                            <span className="font-medium text-green-600">{formatCurrency(entry.valor)}</span>
                                          ) : (
                                            <Badge variant="outline" className="text-amber-500 border-amber-500">
                                              Sem valor atribuído
                                            </Badge>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))}

                                    <TableRow className="bg-muted/30 font-medium">
                                      <TableCell className="text-right">
                                        Subtotal {p.plantonista_name}
                                        {p.total_sem_valor > 0 && (
                                          <span className="text-amber-500 font-normal ml-2">({p.total_sem_valor} sem valor)</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right text-green-600">{formatCurrency(p.total_valor)}</TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              </ScrollArea>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Resumo por Plantonista (somando todos os setores) */}
          <Card className="bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Resumo por plantonista (todos os setores)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Plantonista</TableHead>
                    <TableHead className="text-center">Plantões</TableHead>
                    <TableHead className="text-center">Sem valor</TableHead>
                    <TableHead className="text-right">Total a receber</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plantonistaTotals.map((p) => (
                    <TableRow key={p.plantonista_id}>
                      <TableCell className="font-medium">{p.plantonista_name}</TableCell>
                      <TableCell className="text-center"><Badge variant="secondary">{p.total_plantoes}</Badge></TableCell>
                      <TableCell className="text-center">
                        {p.total_sem_valor > 0 ? (
                          <Badge variant="outline" className="text-amber-500 border-amber-500">{p.total_sem_valor}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">{formatCurrency(p.total_valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grand Total Card */}
      {sectorReports.length > 0 && (
        <Card className="border-2 border-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">TOTAL GERAL</p>
                <p className="text-sm text-muted-foreground">
                  {grandTotals.total_plantonistas} plantonistas · {grandTotals.total_plantoes} plantões
                  {grandTotals.total_sem_valor > 0 && (
                    <span className="text-amber-500 ml-2">· {grandTotals.total_sem_valor} sem valor atribuído</span>
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
