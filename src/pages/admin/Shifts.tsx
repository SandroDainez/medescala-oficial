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

interface ShiftWithAssignment {
  assignment_id: string;
  shift_id: string;
  shift_date: string;
  title: string;
  start_time: string;
  end_time: string;
  base_value: number | null;
  assigned_value: number | null;
  sector_id: string | null;
  sector_name: string | null;
  sector_color: string | null;
  plantonista_id: string;
  plantonista_name: string | null;
  status: string;
}

export default function AdminShifts() {
  const { currentTenantId } = useTenant();
  const [assignments, setAssignments] = useState<ShiftWithAssignment[]>([]);
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

  // Filtrar pelo mês e setor selecionados
  const filteredAssignments = useMemo(() => {
    const filterDate = new Date(selectedYear, selectedMonth, 1);
    const monthStart = startOfMonth(filterDate);
    const monthEnd = endOfMonth(filterDate);

    return assignments.filter((item) => {
      const shiftDate = new Date(item.shift_date + 'T00:00:00');
      const isInMonth = shiftDate >= monthStart && shiftDate <= monthEnd;
      const isInSector = selectedSectorId === 'all' || item.sector_id === selectedSectorId;
      return isInMonth && isInSector;
    });
  }, [assignments, selectedMonth, selectedYear, selectedSectorId]);

  // Agrupar por setor
  const assignmentsBySector = useMemo(() => {
    const grouped: Record<string, { sector: Sector; items: ShiftWithAssignment[] }> = {};
    
    filteredAssignments.forEach((item) => {
      const sectorId = item.sector_id || 'sem-setor';
      if (!grouped[sectorId]) {
        const sector = sectors.find(s => s.id === sectorId) || { 
          id: sectorId, 
          name: item.sector_name || 'Sem Setor', 
          color: item.sector_color || '#6b7280' 
        };
        grouped[sectorId] = { sector, items: [] };
      }
      grouped[sectorId].items.push(item);
    });

    // Ordenar items dentro de cada setor por data e horário
    Object.values(grouped).forEach(group => {
      group.items.sort((a, b) => {
        const dateCompare = new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.start_time.localeCompare(b.start_time);
      });
    });

    return grouped;
  }, [filteredAssignments, sectors]);

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

    // Fetch shift assignments with shift and profile data
    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        shift_id,
        user_id,
        assigned_value,
        status,
        shift:shifts!shift_assignments_shift_id_fkey(
          id,
          title,
          shift_date,
          start_time,
          end_time,
          base_value,
          sector_id,
          sector:sectors!shifts_sector_id_fkey(id, name, color)
        ),
        profile:profiles!shift_assignments_user_id_profiles_fkey(name)
      `)
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const mapped: ShiftWithAssignment[] = data
        .filter(item => item.shift) // Filtrar assignments sem shift
        .map(item => ({
          assignment_id: item.id,
          shift_id: item.shift_id,
          shift_date: (item.shift as any).shift_date,
          title: (item.shift as any).title,
          start_time: (item.shift as any).start_time,
          end_time: (item.shift as any).end_time,
          base_value: (item.shift as any).base_value,
          assigned_value: item.assigned_value,
          sector_id: (item.shift as any).sector_id,
          sector_name: (item.shift as any).sector?.name || null,
          sector_color: (item.shift as any).sector?.color || null,
          plantonista_id: item.user_id,
          plantonista_name: (item.profile as any)?.name || null,
          status: item.status,
        }));
      
      setAssignments(mapped);
    }

    setLoading(false);
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00');
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  }

  function formatTime(timeStr: string) {
    return timeStr.slice(0, 5);
  }

  function formatCurrency(value: number | null) {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  function getStatusBadge(status: string) {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      'assigned': { label: 'Atribuído', variant: 'secondary' },
      'confirmed': { label: 'Confirmado', variant: 'default' },
      'completed': { label: 'Concluído', variant: 'default' },
      'cancelled': { label: 'Cancelado', variant: 'destructive' },
    };
    const config = statusMap[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
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

      {Object.keys(assignmentsBySector).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum plantão encontrado para o período selecionado.
          </CardContent>
        </Card>
      ) : (
        Object.entries(assignmentsBySector).map(([sectorId, { sector, items }]) => (
          <Card key={sectorId}>
            <CardContent className="p-0">
              <div 
                className="px-4 py-3 border-b flex items-center gap-2"
                style={{ borderLeftWidth: 4, borderLeftColor: sector.color || '#22c55e' }}
              >
                <h3 className="font-semibold text-lg">{sector.name}</h3>
                <Badge variant="secondary">{items.length} plantões</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Data</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Plantonista</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.assignment_id}>
                      <TableCell className="font-medium">
                        {formatDate(item.shift_date)}
                      </TableCell>
                      <TableCell>{item.title}</TableCell>
                      <TableCell>
                        {item.plantonista_name || 'Não atribuído'}
                      </TableCell>
                      <TableCell>
                        {formatTime(item.start_time)} - {formatTime(item.end_time)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.assigned_value ?? item.base_value)}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(item.status)}
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
      {filteredAssignments.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Total de Plantões:</span>{' '}
                <span className="font-semibold">{filteredAssignments.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Valor Total:</span>{' '}
                <span className="font-semibold">
                  {formatCurrency(filteredAssignments.reduce((sum, item) => 
                    sum + (item.assigned_value ?? item.base_value ?? 0), 0
                  ))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Confirmados:</span>{' '}
                <span className="font-semibold">
                  {filteredAssignments.filter(i => i.status === 'confirmed' || i.status === 'completed').length}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Pendentes:</span>{' '}
                <span className="font-semibold">
                  {filteredAssignments.filter(i => i.status === 'assigned').length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
