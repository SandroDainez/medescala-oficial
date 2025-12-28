import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

interface ShiftEntry {
  id: string;
  data: string;
  valor: number | null;
  status_valor: 'COM_VALOR' | 'SEM_VALOR';
  plantonista_id: string;
  setor_id: string;
  plantonista?: { name: string | null } | null;
  setor?: { name: string; color: string | null } | null;
  source_shift?: { title: string; start_time: string; end_time: string } | null;
}

export default function AdminShifts() {
  const { currentTenantId } = useTenant();
  const [entries, setEntries] = useState<ShiftEntry[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedSectorId, setSelectedSectorId] = useState<string>('all');

  // Meses do ano
  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: i.toString(),
      label: format(new Date(2024, i, 1), 'MMMM', { locale: ptBR }),
    }));
  }, []);

  // Anos disponíveis (5 anos antes até 5 anos depois)
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => {
      const year = currentYear - 5 + i;
      return { value: year.toString(), label: year.toString() };
    });
  }, []);

  // Filtrar entries pelo mês e setor selecionados
  const filteredEntries = useMemo(() => {
    const filterDate = new Date(selectedYear, selectedMonth, 1);
    const monthStart = startOfMonth(filterDate);
    const monthEnd = endOfMonth(filterDate);

    return entries.filter((entry) => {
      const entryDate = new Date(entry.data + 'T00:00:00');
      const isInMonth = entryDate >= monthStart && entryDate <= monthEnd;
      const isInSector = selectedSectorId === 'all' || entry.setor_id === selectedSectorId;
      return isInMonth && isInSector;
    });
  }, [entries, selectedMonth, selectedYear, selectedSectorId]);

  // Agrupar por setor
  const entriesBySector = useMemo(() => {
    const grouped: Record<string, { sector: Sector; entries: ShiftEntry[] }> = {};
    
    filteredEntries.forEach((entry) => {
      const sectorId = entry.setor_id;
      if (!grouped[sectorId]) {
        const sector = sectors.find(s => s.id === sectorId) || { id: sectorId, name: 'Sem Setor', color: null };
        grouped[sectorId] = { sector, entries: [] };
      }
      grouped[sectorId].entries.push(entry);
    });

    // Ordenar entries dentro de cada setor por data
    Object.values(grouped).forEach(group => {
      group.entries.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    });

    return grouped;
  }, [filteredEntries, sectors]);

  useEffect(() => {
    if (currentTenantId) {
      fetchData();
    }
  }, [currentTenantId]);

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);

    // Fetch sectors
    const { data: sectorsData } = await supabase
      .from('sectors')
      .select('id, name, color')
      .eq('tenant_id', currentTenantId)
      .eq('active', true)
      .order('name');

    if (sectorsData) setSectors(sectorsData);

    // Fetch shift entries with related data
    const { data: entriesData, error } = await supabase
      .from('shift_entries')
      .select(`
        id,
        data,
        valor,
        status_valor,
        plantonista_id,
        setor_id,
        plantonista:profiles!shift_entries_plantonista_id_fkey(name),
        setor:sectors!shift_entries_setor_id_fkey(name, color),
        source_shift:shifts!shift_entries_source_shift_id_fkey(title, start_time, end_time)
      `)
      .eq('tenant_id', currentTenantId)
      .order('data', { ascending: true });

    if (!error && entriesData) {
      setEntries(entriesData as unknown as ShiftEntry[]);
    }

    setLoading(false);
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00');
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  }

  function formatCurrency(value: number | null) {
    if (value === null) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  if (loading) {
    return <div className="text-muted-foreground p-6">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Lista de Plantões</h2>
          <p className="text-muted-foreground">Visualize os plantões das escalas por setor</p>
        </div>
        
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedMonth.toString()}
              onValueChange={(value) => setSelectedMonth(parseInt(value))}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select
              value={selectedYear.toString()}
              onValueChange={(value) => setSelectedYear(parseInt(value))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os setores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {sectors.map((sector) => (
                <SelectItem key={sector.id} value={sector.id}>
                  {sector.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {Object.keys(entriesBySector).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum plantão encontrado para o período selecionado.
          </CardContent>
        </Card>
      ) : (
        Object.entries(entriesBySector).map(([sectorId, { sector, entries: sectorEntries }]) => (
          <Card key={sectorId}>
            <CardContent className="p-0">
              <div 
                className="px-4 py-3 border-b flex items-center gap-2"
                style={{ borderLeftWidth: 4, borderLeftColor: sector.color || '#22c55e' }}
              >
                <h3 className="font-semibold text-lg">{sector.name}</h3>
                <Badge variant="secondary">{sectorEntries.length} plantões</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Data</TableHead>
                    <TableHead>Plantonista</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectorEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {formatDate(entry.data)}
                      </TableCell>
                      <TableCell>
                        {entry.plantonista?.name || 'Não atribuído'}
                      </TableCell>
                      <TableCell>
                        {entry.source_shift 
                          ? `${entry.source_shift.title} (${entry.source_shift.start_time.slice(0, 5)} - ${entry.source_shift.end_time.slice(0, 5)})`
                          : '-'
                        }
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(entry.valor)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={entry.status_valor === 'COM_VALOR' ? 'default' : 'secondary'}>
                          {entry.status_valor === 'COM_VALOR' ? 'Com Valor' : 'Sem Valor'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      {/* Resumo */}
      {filteredEntries.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Total de Plantões:</span>{' '}
                <span className="font-semibold">{filteredEntries.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Valor Total:</span>{' '}
                <span className="font-semibold">
                  {formatCurrency(filteredEntries.reduce((sum, e) => sum + (e.valor || 0), 0))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Com Valor:</span>{' '}
                <span className="font-semibold">
                  {filteredEntries.filter(e => e.status_valor === 'COM_VALOR').length}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Sem Valor:</span>{' '}
                <span className="font-semibold">
                  {filteredEntries.filter(e => e.status_valor === 'SEM_VALOR').length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
