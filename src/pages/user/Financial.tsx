import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { DollarSign, Calendar, Clock, Building, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ShiftDetail {
  id: string;
  assigned_value: number;
  checkin_at: string | null;
  checkout_at: string | null;
  shift_date: string;
  title: string;
  hospital: string;
  sector_name: string;
  sector_id: string | null;
  start_time: string;
  end_time: string;
  duration_hours: number;
}

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
  status: string | null;
}

export default function UserFinancial() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [summary, setSummary] = useState<FinancialSummary>({ totalShifts: 0, totalHours: 0, totalValue: 0, status: null });
  const [shifts, setShifts] = useState<ShiftDetail[]>([]);
  const [sectorSummaries, setSectorSummaries] = useState<SectorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
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
  const years = [2024, 2025, 2026, 2027];

  // Calculate duration in hours
  function calculateDuration(start: string, end: string): number {
    if (!start || !end) return 0;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let hours = endH - startH;
    let minutes = endM - startM;
    if (hours < 0 || (hours === 0 && minutes < 0)) {
      hours += 24;
    }
    return hours + (minutes / 60);
  }

  useEffect(() => {
    if (user && currentTenantId) fetchData();
  }, [user, currentTenantId, selectedMonth, selectedYear]);

  async function fetchData() {
    if (!currentTenantId || !user) return;
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
      .eq('user_id', user?.id)
      .in('status', ['assigned', 'completed'])
      .gte('shift.shift_date', startDate)
      .lte('shift.shift_date', endDate);
    
    if (error) {
      console.error('[UserFinancial] Error fetching:', error);
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
      // Map assignments to detailed shifts with proper value calculation
      const mappedShifts: ShiftDetail[] = assignments.map((a: any) => {
        const assignedVal = Number(a.assigned_value) || 0;
        const baseVal = Number(a.shift?.base_value) || 0;
        const finalValue = assignedVal > 0 ? assignedVal : baseVal;
        const duration = calculateDuration(a.shift?.start_time || '', a.shift?.end_time || '');
        
        return {
          id: a.id,
          assigned_value: finalValue,
          checkin_at: a.checkin_at,
          checkout_at: a.checkout_at,
          shift_date: a.shift?.shift_date,
          title: a.shift?.title || '',
          hospital: a.shift?.hospital || '',
          sector_name: a.shift?.sector?.name || 'Sem Setor',
          sector_id: a.shift?.sector?.id || a.shift?.sector_id || null,
          start_time: a.shift?.start_time || '',
          end_time: a.shift?.end_time || '',
          duration_hours: duration
        };
      }).sort((a, b) => new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime());
      
      console.log('[UserFinancial] Processed shifts:', mappedShifts.slice(0, 3).map(s => ({
        date: s.shift_date,
        value: s.assigned_value,
        sector: s.sector_name
      })));
      
      setShifts(mappedShifts);
      
      // Build sector summaries
      const sectorMap: Record<string, SectorSummary> = {};
      
      mappedShifts.forEach(shift => {
        const sectorKey = shift.sector_id || 'sem-setor';
        if (!sectorMap[sectorKey]) {
          sectorMap[sectorKey] = {
            sector_id: sectorKey,
            sector_name: shift.sector_name,
            total_shifts: 0,
            total_hours: 0,
            total_value: 0,
            shifts: []
          };
        }
        sectorMap[sectorKey].total_shifts++;
        sectorMap[sectorKey].total_hours += shift.duration_hours;
        sectorMap[sectorKey].total_value += shift.assigned_value;
        sectorMap[sectorKey].shifts.push(shift);
      });
      
      const sectors = Object.values(sectorMap).sort((a, b) => b.total_value - a.total_value);
      setSectorSummaries(sectors);
      
      // Calculate totals
      const totalHours = mappedShifts.reduce((sum, s) => sum + s.duration_hours, 0);
      const totalValue = mappedShifts.reduce((sum, s) => sum + s.assigned_value, 0);
      
      setSummary({
        totalShifts: mappedShifts.length,
        totalHours,
        totalValue,
        status: payment?.status || null
      });
    } else {
      setShifts([]);
      setSectorSummaries([]);
      setSummary({ totalShifts: 0, totalHours: 0, totalValue: 0, status: payment?.status || null });
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
                        {shift.shift_date && format(parseISO(shift.shift_date), 'dd/MM (EEE)', { locale: ptBR })}
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
