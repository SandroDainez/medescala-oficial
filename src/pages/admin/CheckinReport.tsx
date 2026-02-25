import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { 
  MapPin, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Download,
  Filter
} from 'lucide-react';

interface CheckinRecord {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  user_name: string;
  sector_name: string;
  sector_color: string | null;
  checkin_at: string | null;
  checkout_at: string | null;
  status: string;
  has_gps: boolean;
}

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

export default function CheckinReport() {
  const { currentTenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CheckinRecord[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSector, setSelectedSector] = useState<string>('all');
  
  // Month/Year state - allows any month/year selection
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const fetchSectors = useCallback(async () => {
    if (!currentTenantId) return;
    const { data } = await supabase
      .from('sectors')
      .select('id, name, color')
      .eq('tenant_id', currentTenantId)
      .eq('active', true)
      .order('name');
    if (data) setSectors(data);
  }, [currentTenantId]);

  const fetchRecords = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);

    const startDate = format(startOfMonth(new Date(selectedYear, selectedMonth - 1)), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date(selectedYear, selectedMonth - 1)), 'yyyy-MM-dd');

    const query = supabase
      .from('shift_assignments')
      .select(`
        id,
        checkin_at,
        checkout_at,
        status,
        user:profiles!shift_assignments_user_id_profiles_fkey(name),
        shift:shifts!shift_assignments_shift_id_fkey(
          shift_date,
          start_time,
          end_time,
          sector:sectors(id, name, color)
        )
      `)
      .eq('tenant_id', currentTenantId)
      .gte('shift.shift_date', startDate)
      .lte('shift.shift_date', endDate)
      .order('shift(shift_date)', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching checkin records:', error);
      setLoading(false);
      return;
    }

    // Check for GPS locations
    const assignmentIds = data?.map(r => r.id) || [];
    const { data: locations } = await supabase
      .from('shift_assignment_locations')
      .select('assignment_id')
      .in('assignment_id', assignmentIds);

    const locationSet = new Set(locations?.map(l => l.assignment_id) || []);

    const mapped: CheckinRecord[] = (data || [])
      .filter(r => r.shift && r.shift.sector)
      .filter(r => selectedSector === 'all' || r.shift.sector.id === selectedSector)
      .map(r => ({
        id: r.id,
        shift_date: r.shift.shift_date,
        start_time: r.shift.start_time,
        end_time: r.shift.end_time,
        user_name: r.user?.name || 'Usuário não encontrado',
        sector_name: r.shift.sector.name,
        sector_color: r.shift.sector.color,
        checkin_at: r.checkin_at,
        checkout_at: r.checkout_at,
        status: r.status,
        has_gps: locationSet.has(r.id),
      }));

    setRecords(mapped);
    setLoading(false);
  }, [currentTenantId, selectedYear, selectedMonth, selectedSector]);

  useEffect(() => {
    if (currentTenantId) {
      fetchSectors();
    }
  }, [currentTenantId, fetchSectors]);

  useEffect(() => {
    if (currentTenantId) {
      fetchRecords();
    }
  }, [currentTenantId, selectedSector, selectedMonth, selectedYear, fetchRecords]);

  function getCheckinStatus(record: CheckinRecord) {
    if (!record.checkin_at && !record.checkout_at) {
      return { label: 'Sem registro', color: 'bg-muted text-muted-foreground', icon: XCircle };
    }
    if (record.checkin_at && record.checkout_at) {
      return { label: 'Completo', color: 'bg-green-500/10 text-green-600 border-green-500', icon: CheckCircle2 };
    }
    if (record.checkin_at && !record.checkout_at) {
      return { label: 'Apenas check-in', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500', icon: AlertCircle };
    }
    return { label: 'Apenas check-out', color: 'bg-orange-500/10 text-orange-600 border-orange-500', icon: AlertCircle };
  }

  function formatTime(datetime: string | null) {
    if (!datetime) return '-';
    return format(new Date(datetime), 'HH:mm', { locale: ptBR });
  }

  function exportToCSV() {
    const headers = ['Data', 'Plantonista', 'Setor', 'Horário Plantão', 'Check-in', 'Check-out', 'GPS', 'Status'];
    const rows = records.map(r => [
      format(new Date(r.shift_date), 'dd/MM/yyyy'),
      r.user_name,
      r.sector_name,
      `${r.start_time.slice(0, 5)} - ${r.end_time.slice(0, 5)}`,
      r.checkin_at ? format(new Date(r.checkin_at), 'dd/MM/yyyy HH:mm') : '-',
      r.checkout_at ? format(new Date(r.checkout_at), 'dd/MM/yyyy HH:mm') : '-',
      r.has_gps ? 'Sim' : 'Não',
      getCheckinStatus(r).label,
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `checkins_${selectedYear}-${String(selectedMonth).padStart(2, '0')}.csv`;
    link.click();
  }


  // Stats
  const totalRecords = records.length;
  const completeCheckins = records.filter(r => r.checkin_at && r.checkout_at).length;
  const pendingCheckins = records.filter(r => !r.checkin_at).length;
  const withGps = records.filter(r => r.has_gps).length;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Relatório de Check-ins
          </h1>
          <p className="text-muted-foreground">
            Acompanhe os registros de entrada e saída dos plantonistas por setor
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1.5 block">Período</label>
            <MonthYearPicker
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium mb-1.5 block">Setor</label>
            <Select value={selectedSector} onValueChange={setSelectedSector}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Setores</SelectItem>
                {sectors.map(sector => (
                  <SelectItem key={sector.id} value={sector.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: sector.color || '#6b7280' }}
                      />
                      {sector.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Plantões</CardDescription>
            <CardTitle className="text-3xl">{totalRecords}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Check-ins Completos</CardDescription>
            <CardTitle className="text-3xl text-green-600">{completeCheckins}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sem Check-in</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{pendingCheckins}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com GPS</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{withGps}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Table grouped by Sector */}
      <Card>
        <CardHeader>
          <CardTitle>Registros de Check-in/Check-out</CardTitle>
          <CardDescription>
            {format(new Date(selectedYear, selectedMonth - 1, 1), 'MMMM yyyy', { locale: ptBR })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum registro encontrado para o período selecionado</p>
            </div>
          ) : (
            <div className="space-y-8">
              {(() => {
                // Group records by sector
                const grouped: Record<string, { sectorName: string; sectorColor: string | null; items: CheckinRecord[] }> = {};
                records.forEach(r => {
                  const key = r.sector_name;
                  if (!grouped[key]) {
                    grouped[key] = { sectorName: r.sector_name, sectorColor: r.sector_color, items: [] };
                  }
                  grouped[key].items.push(r);
                });
                // Sort groups alphabetically
                const sortedGroups = Object.values(grouped).sort((a, b) => a.sectorName.localeCompare(b.sectorName));

                return sortedGroups.map(group => (
                  <div key={group.sectorName} className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: group.sectorColor || '#6b7280' }}
                      />
                      <h3 className="font-semibold text-lg">{group.sectorName}</h3>
                      <Badge variant="secondary" className="ml-auto">{group.items.length} plantões</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Plantonista</TableHead>
                            <TableHead>Horário</TableHead>
                            <TableHead>Check-in</TableHead>
                            <TableHead>Check-out</TableHead>
                            <TableHead>GPS</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.items.map(record => {
                            const statusInfo = getCheckinStatus(record);
                            const StatusIcon = statusInfo.icon;
                            return (
                              <TableRow key={record.id}>
                                <TableCell className="font-medium">
                                  {format(new Date(record.shift_date), 'dd/MM/yyyy')}
                                </TableCell>
                                <TableCell>{record.user_name}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {record.start_time.slice(0, 5)} - {record.end_time.slice(0, 5)}
                                </TableCell>
                                <TableCell>
                                  {record.checkin_at ? (
                                    <span className="text-green-600 font-medium">
                                      {formatTime(record.checkin_at)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {record.checkout_at ? (
                                    <span className="text-green-600 font-medium">
                                      {formatTime(record.checkout_at)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {record.has_gps ? (
                                    <MapPin className="h-4 w-4 text-blue-500" />
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={statusInfo.color}>
                                    <StatusIcon className="h-3 w-3 mr-1" />
                                    {statusInfo.label}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
