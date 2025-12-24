import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Download, Lock, Printer, DollarSign, Users, Calendar, MapPin, Eye, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PaymentSummary {
  user_id: string;
  user_name: string | null;
  total_shifts: number;
  total_value: number;
  payment_status: string | null;
}

interface ShiftDetail {
  id: string;
  shift_id: string;
  user_id: string;
  user_name: string | null;
  assigned_value: number;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_name: string;
  hospital: string;
}

export default function AdminFinancial() {
  const { user } = useAuth();
  const { currentTenantId, currentTenantName } = useTenant();
  const { toast } = useToast();
  const [summaries, setSummaries] = useState<PaymentSummary[]>([]);
  const [shiftDetails, setShiftDetails] = useState<ShiftDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedUser, setSelectedUser] = useState<PaymentSummary | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  
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
  const years = [2024, 2025, 2026];

  useEffect(() => {
    if (currentTenantId) {
      fetchSummaries();
      fetchShiftDetails();
    }
  }, [currentTenantId, selectedMonth, selectedYear]);

  async function fetchSummaries() {
    if (!currentTenantId) return;
    setLoading(true);
    
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];
    
    const { data: assignments } = await supabase
      .from('shift_assignments')
      .select('user_id, assigned_value, shift:shifts!inner(shift_date)')
      .eq('tenant_id', currentTenantId)
      .gte('shift.shift_date', startDate)
      .lte('shift.shift_date', endDate);
    
    const { data: members } = await supabase
      .from('memberships')
      .select('user_id, profile:profiles!memberships_user_id_profiles_fkey(name)')
      .eq('tenant_id', currentTenantId);
    
    const { data: payments } = await supabase
      .from('payments')
      .select('user_id, status')
      .eq('tenant_id', currentTenantId)
      .eq('month', selectedMonth)
      .eq('year', selectedYear);

    const userSummaries: Record<string, PaymentSummary> = {};
    
    members?.forEach((m: any) => {
      userSummaries[m.user_id] = {
        user_id: m.user_id,
        user_name: m.profile?.name,
        total_shifts: 0,
        total_value: 0,
        payment_status: null
      };
    });
    
    assignments?.forEach((a: any) => {
      if (userSummaries[a.user_id]) {
        userSummaries[a.user_id].total_shifts += 1;
        userSummaries[a.user_id].total_value += Number(a.assigned_value) || 0;
      }
    });
    
    payments?.forEach((p: any) => {
      if (userSummaries[p.user_id]) {
        userSummaries[p.user_id].payment_status = p.status;
      }
    });

    setSummaries(Object.values(userSummaries).filter(s => s.total_shifts > 0 || s.payment_status));
    setLoading(false);
  }

  async function fetchShiftDetails() {
    if (!currentTenantId) return;
    
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        shift_id,
        user_id,
        assigned_value,
        profile:profiles!shift_assignments_user_id_profiles_fkey(name),
        shift:shifts!inner(
          shift_date,
          start_time,
          end_time,
          hospital,
          sector:sectors(name)
        )
      `)
      .eq('tenant_id', currentTenantId)
      .gte('shift.shift_date', startDate)
      .lte('shift.shift_date', endDate)
      .order('shift.shift_date', { ascending: true });

    if (data) {
      const details: ShiftDetail[] = data.map((d: any) => ({
        id: d.id,
        shift_id: d.shift_id,
        user_id: d.user_id,
        user_name: d.profile?.name || 'N/A',
        assigned_value: Number(d.assigned_value) || 0,
        shift_date: d.shift?.shift_date,
        start_time: d.shift?.start_time,
        end_time: d.shift?.end_time,
        sector_name: d.shift?.sector?.name || 'N/A',
        hospital: d.shift?.hospital || 'N/A'
      }));
      setShiftDetails(details);
    }
  }

  async function closeMonth(userId: string, totalShifts: number, totalValue: number) {
    if (!currentTenantId) return;
    
    const { error } = await supabase
      .from('payments')
      .upsert({
        tenant_id: currentTenantId,
        user_id: userId,
        month: selectedMonth,
        year: selectedYear,
        total_shifts: totalShifts,
        total_value: totalValue,
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: user?.id
      }, { onConflict: 'user_id,month,year' });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Mês fechado!' });
      fetchSummaries();
    }
  }

  function exportCSV() {
    const headers = ['Nome', 'Plantões', 'Valor Total', 'Status'];
    const rows = summaries.map(s => [
      s.user_name || 'N/A',
      s.total_shifts.toString(),
      s.total_value.toFixed(2),
      s.payment_status || 'aberto'
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-${selectedMonth}-${selectedYear}.csv`;
    a.click();
  }

  function exportDetailedCSV() {
    const headers = ['Plantonista', 'Data', 'Local/Setor', 'Horário', 'Valor'];
    const rows = shiftDetails.map(s => [
      s.user_name,
      format(parseISO(s.shift_date), 'dd/MM/yyyy'),
      s.sector_name,
      `${s.start_time?.slice(0, 5) || ''} - ${s.end_time?.slice(0, 5) || ''}`,
      s.assigned_value.toFixed(2)
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantoes-detalhado-${selectedMonth}-${selectedYear}.csv`;
    a.click();
  }

  function handlePrintReport() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Erro', description: 'Não foi possível abrir a janela de impressão', variant: 'destructive' });
      return;
    }

    const monthLabel = months.find(m => m.value === selectedMonth)?.label || '';
    
    // Group shifts by user
    const userShifts: Record<string, ShiftDetail[]> = {};
    shiftDetails.forEach(detail => {
      if (!userShifts[detail.user_id]) {
        userShifts[detail.user_id] = [];
      }
      userShifts[detail.user_id].push(detail);
    });

    let tableRows = '';
    
    Object.entries(userShifts).forEach(([userId, shifts]) => {
      const userName = shifts[0]?.user_name || 'N/A';
      const totalValue = shifts.reduce((sum, s) => sum + s.assigned_value, 0);
      
      shifts.forEach((shift, idx) => {
        tableRows += `
          <tr>
            ${idx === 0 ? `<td rowspan="${shifts.length}" style="vertical-align: top; font-weight: 600; border: 1px solid #ddd; padding: 8px; background: #f8f9fa;">${userName}<br><small style="font-weight: normal; color: #666;">${shifts.length} plantões</small></td>` : ''}
            <td style="border: 1px solid #ddd; padding: 8px;">${format(parseISO(shift.shift_date), 'dd/MM/yyyy')}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${shift.sector_name}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${shift.start_time?.slice(0, 5) || ''} - ${shift.end_time?.slice(0, 5) || ''}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">R$ ${shift.assigned_value.toFixed(2)}</td>
            ${idx === 0 ? `<td rowspan="${shifts.length}" style="vertical-align: top; font-weight: 700; border: 1px solid #ddd; padding: 8px; background: #e8f5e9; text-align: right;">R$ ${totalValue.toFixed(2)}</td>` : ''}
          </tr>
        `;
      });
    });

    // Calculate grand totals
    const grandTotalShifts = shiftDetails.length;
    const grandTotalValue = shiftDetails.reduce((sum, s) => sum + s.assigned_value, 0);
    const uniqueUsers = [...new Set(shiftDetails.map(s => s.user_id))].length;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório Financeiro - ${monthLabel} ${selectedYear}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { margin-bottom: 5px; color: #1a1a1a; }
          h2 { color: #666; font-weight: normal; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #1a1a1a; color: white; padding: 10px; text-align: left; }
          .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
          .stat-card { padding: 15px 25px; background: #f5f5f5; border-radius: 8px; text-align: center; min-width: 120px; }
          .stat-number { font-size: 24px; font-weight: bold; }
          .stat-label { font-size: 12px; color: #666; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #999; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Relatório Financeiro - ${currentTenantName || 'Hospital'}</h1>
        <h2>${monthLabel} de ${selectedYear}</h2>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-number">${uniqueUsers}</div>
            <div class="stat-label">Plantonistas</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${grandTotalShifts}</div>
            <div class="stat-label">Total de Plantões</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">R$ ${grandTotalValue.toFixed(2)}</div>
            <div class="stat-label">Valor Total</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Plantonista</th>
              <th>Data</th>
              <th>Local/Setor</th>
              <th>Horário</th>
              <th>Valor</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #666;">Nenhum plantão neste período</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Relatório gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  function handlePrintUserDetail(userSummary: PaymentSummary) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Erro', description: 'Não foi possível abrir a janela de impressão', variant: 'destructive' });
      return;
    }

    const monthLabel = months.find(m => m.value === selectedMonth)?.label || '';
    const userDetails = shiftDetails.filter(d => d.user_id === userSummary.user_id);

    let tableRows = userDetails.map(shift => `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${format(parseISO(shift.shift_date), 'EEEE, dd/MM/yyyy', { locale: ptBR })}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${shift.sector_name}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${shift.start_time?.slice(0, 5) || ''} - ${shift.end_time?.slice(0, 5) || ''}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">R$ ${shift.assigned_value.toFixed(2)}</td>
      </tr>
    `).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Extrato - ${userSummary.user_name} - ${monthLabel} ${selectedYear}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { margin-bottom: 5px; color: #1a1a1a; }
          h2 { color: #666; font-weight: normal; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #1a1a1a; color: white; padding: 10px; text-align: left; }
          .summary { margin: 20px 0; padding: 20px; background: #e8f5e9; border-radius: 8px; }
          .summary-row { display: flex; justify-content: space-between; margin: 5px 0; }
          .summary-total { font-size: 24px; font-weight: bold; color: #2e7d32; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #999; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>Extrato de Plantões</h1>
        <h2>${userSummary.user_name || 'Plantonista'} - ${monthLabel} de ${selectedYear}</h2>

        <div class="summary">
          <div class="summary-row">
            <span>Total de Plantões:</span>
            <strong>${userSummary.total_shifts}</strong>
          </div>
          <div class="summary-row">
            <span>Valor Total:</span>
            <span class="summary-total">R$ ${userSummary.total_value.toFixed(2)}</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Local/Setor</th>
              <th>Horário</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #666;">Nenhum plantão</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background: #f5f5f5; font-weight: bold;">
              <td colspan="3" style="border: 1px solid #ddd; padding: 8px; text-align: right;">TOTAL:</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">R$ ${userSummary.total_value.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          ${currentTenantName || 'Hospital'} - Extrato gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  function openUserDetails(summary: PaymentSummary) {
    setSelectedUser(summary);
    setDetailDialogOpen(true);
  }

  // Calculate totals
  const totalShiftsAll = summaries.reduce((sum, s) => sum + s.total_shifts, 0);
  const totalValueAll = summaries.reduce((sum, s) => sum + s.total_value, 0);

  if (loading) return <div className="text-muted-foreground p-4">Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Financeiro</h2>
          <p className="text-muted-foreground">Resumo e relatórios financeiros</p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{summaries.length}</p>
                <p className="text-xs text-muted-foreground">Plantonistas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalShiftsAll}</p>
                <p className="text-xs text-muted-foreground">Total Plantões</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">R$ {totalValueAll.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Valor Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  R$ {summaries.length > 0 ? (totalValueAll / summaries.length).toFixed(2) : '0.00'}
                </p>
                <p className="text-xs text-muted-foreground">Média por Plantonista</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="summary" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="summary">Resumo</TabsTrigger>
            <TabsTrigger value="detailed">Detalhado</TabsTrigger>
          </TabsList>
          
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handlePrintReport}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Relatório
            </Button>
            <Button variant="outline" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" />
              Exportar Resumo
            </Button>
            <Button variant="outline" onClick={exportDetailedCSV}>
              <FileText className="mr-2 h-4 w-4" />
              Exportar Detalhado
            </Button>
          </div>
        </div>

        {/* Summary Tab */}
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>Resumo por Plantonista</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plantonista</TableHead>
                    <TableHead className="text-center">Plantões</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhum dado para o período selecionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    summaries.map(s => (
                      <TableRow key={s.user_id}>
                        <TableCell className="font-medium">{s.user_name || 'N/A'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{s.total_shifts}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          R$ {s.total_value.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={s.payment_status === 'closed' ? 'default' : s.payment_status === 'paid' ? 'secondary' : 'outline'}>
                            {s.payment_status === 'closed' ? 'Fechado' : s.payment_status === 'paid' ? 'Pago' : 'Aberto'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => openUserDetails(s)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handlePrintUserDetail(s)}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {(!s.payment_status || s.payment_status === 'open') && s.total_shifts > 0 && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => closeMonth(s.user_id, s.total_shifts, s.total_value)}
                              >
                                <Lock className="mr-1 h-4 w-4" />
                                Fechar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed Tab */}
        <TabsContent value="detailed">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Todos os Plantões do Período
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plantonista</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Local/Setor</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftDetails.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhum plantão para o período selecionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    shiftDetails.map(detail => (
                      <TableRow key={detail.id}>
                        <TableCell className="font-medium">{detail.user_name}</TableCell>
                        <TableCell>
                          {detail.shift_date && format(parseISO(detail.shift_date), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell>{detail.sector_name}</TableCell>
                        <TableCell>
                          {detail.start_time?.slice(0, 5)} - {detail.end_time?.slice(0, 5)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          R$ {detail.assigned_value.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Detalhes - {selectedUser?.user_name}</span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => selectedUser && handlePrintUserDetail(selectedUser)}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            {selectedUser && (
              <div className="space-y-4">
                {/* Summary */}
                <Card className="bg-green-50 dark:bg-green-950/20 border-green-200">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Total de Plantões</p>
                        <p className="text-2xl font-bold">{selectedUser.total_shifts}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Valor Total</p>
                        <p className="text-2xl font-bold text-green-600">
                          R$ {selectedUser.total_value.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Shift list */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Local/Setor</TableHead>
                      <TableHead>Horário</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shiftDetails
                      .filter(d => d.user_id === selectedUser.user_id)
                      .map(detail => (
                        <TableRow key={detail.id}>
                          <TableCell>
                            {detail.shift_date && format(parseISO(detail.shift_date), "EEEE, dd/MM", { locale: ptBR })}
                          </TableCell>
                          <TableCell>{detail.sector_name}</TableCell>
                          <TableCell>
                            {detail.start_time?.slice(0, 5)} - {detail.end_time?.slice(0, 5)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            R$ {detail.assigned_value.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    }
                  </TableBody>
                </Table>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
