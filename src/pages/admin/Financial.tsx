import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Download, Lock, Printer, DollarSign, Users, Calendar, MapPin, Eye, FileText, Clock, Filter, ChevronDown, ChevronRight, Building } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths, differenceInHours, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UserSectorSummary {
  sector_id: string;
  sector_name: string;
  total_shifts: number;
  total_hours: number;
  total_value: number;
}

interface PaymentSummary {
  user_id: string;
  user_name: string | null;
  total_shifts: number;
  total_hours: number;
  total_value: number;
  payment_status: string | null;
  sectors: UserSectorSummary[];
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
  duration_hours: number;
  sector_name: string;
  sector_id: string | null;
  hospital: string;
}

interface SectorSummary {
  sector_id: string;
  sector_name: string;
  total_shifts: number;
  total_hours: number;
  total_value: number;
  users: {
    user_id: string;
    user_name: string | null;
    total_shifts: number;
    total_hours: number;
    total_value: number;
  }[];
}

export default function AdminFinancial() {
  const { user } = useAuth();
  const { currentTenantId, currentTenantName } = useTenant();
  const { toast } = useToast();
  const [summaries, setSummaries] = useState<PaymentSummary[]>([]);
  const [sectorSummaries, setSectorSummaries] = useState<SectorSummary[]>([]);
  const [shiftDetails, setShiftDetails] = useState<ShiftDetail[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date range selection
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  
  const [selectedUser, setSelectedUser] = useState<PaymentSummary | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

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

  function setLast7Days() {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    setStartDate(format(sevenDaysAgo, 'yyyy-MM-dd'));
    setEndDate(format(today, 'yyyy-MM-dd'));
  }

  // Calculate duration in hours
  function calculateDuration(start: string, end: string): number {
    if (!start || !end) return 0;
    
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    let hours = endH - startH;
    let minutes = endM - startM;
    
    // Handle overnight shifts
    if (hours < 0 || (hours === 0 && minutes < 0)) {
      hours += 24;
    }
    
    return hours + (minutes / 60);
  }

  useEffect(() => {
    if (currentTenantId) {
      fetchData();
    }
  }, [currentTenantId, startDate, endDate]);

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);

    // Fetch all assignments with shift details
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
          sector_id,
          sector:sectors(name)
        )
      `)
      .eq('tenant_id', currentTenantId)
      .gte('shift.shift_date', startDate)
      .lte('shift.shift_date', endDate)
      .order('shift.shift_date', { ascending: true });

    // Fetch members for payment status
    const { data: members } = await supabase
      .from('memberships')
      .select('user_id, profile:profiles!memberships_user_id_profiles_fkey(name)')
      .eq('tenant_id', currentTenantId);

    // Fetch payments
    const { data: payments } = await supabase
      .from('payments')
      .select('user_id, status, month, year')
      .eq('tenant_id', currentTenantId);

    if (data) {
      const details: ShiftDetail[] = data.map((d: any) => {
        const duration = calculateDuration(d.shift?.start_time || '', d.shift?.end_time || '');
        return {
          id: d.id,
          shift_id: d.shift_id,
          user_id: d.user_id,
          user_name: d.profile?.name || 'N/A',
          assigned_value: Number(d.assigned_value) || 0,
          shift_date: d.shift?.shift_date,
          start_time: d.shift?.start_time,
          end_time: d.shift?.end_time,
          duration_hours: duration,
          sector_name: d.shift?.sector?.name || 'N/A',
          sector_id: d.shift?.sector_id || null,
          hospital: d.shift?.hospital || 'N/A'
        };
      });
      setShiftDetails(details);

      // Build summaries with sector breakdown
      const userSummaries: Record<string, PaymentSummary> = {};
      const userSectorMap: Record<string, Record<string, UserSectorSummary>> = {};
      
      members?.forEach((m: any) => {
        userSummaries[m.user_id] = {
          user_id: m.user_id,
          user_name: m.profile?.name,
          total_shifts: 0,
          total_hours: 0,
          total_value: 0,
          payment_status: null,
          sectors: []
        };
        userSectorMap[m.user_id] = {};
      });
      
      details.forEach(d => {
        if (!userSummaries[d.user_id]) {
          userSummaries[d.user_id] = {
            user_id: d.user_id,
            user_name: d.user_name,
            total_shifts: 0,
            total_hours: 0,
            total_value: 0,
            payment_status: null,
            sectors: []
          };
          userSectorMap[d.user_id] = {};
        }
        userSummaries[d.user_id].total_shifts++;
        userSummaries[d.user_id].total_hours += d.duration_hours;
        userSummaries[d.user_id].total_value += d.assigned_value;

        // Track sector breakdown per user
        const sectorKey = d.sector_id || 'sem-setor';
        if (!userSectorMap[d.user_id][sectorKey]) {
          userSectorMap[d.user_id][sectorKey] = {
            sector_id: sectorKey,
            sector_name: d.sector_name || 'Sem Setor',
            total_shifts: 0,
            total_hours: 0,
            total_value: 0
          };
        }
        userSectorMap[d.user_id][sectorKey].total_shifts++;
        userSectorMap[d.user_id][sectorKey].total_hours += d.duration_hours;
        userSectorMap[d.user_id][sectorKey].total_value += d.assigned_value;
      });

      // Assign sectors to each user summary
      Object.keys(userSummaries).forEach(userId => {
        userSummaries[userId].sectors = Object.values(userSectorMap[userId] || {})
          .sort((a, b) => b.total_value - a.total_value);
      });

      setSummaries(Object.values(userSummaries).filter(s => s.total_shifts > 0));

      // Build sector summaries
      const sectorMap: Record<string, SectorSummary> = {};
      
      details.forEach(d => {
        const sectorKey = d.sector_id || 'sem-setor';
        if (!sectorMap[sectorKey]) {
          sectorMap[sectorKey] = {
            sector_id: sectorKey,
            sector_name: d.sector_name || 'Sem Setor',
            total_shifts: 0,
            total_hours: 0,
            total_value: 0,
            users: []
          };
        }
        sectorMap[sectorKey].total_shifts++;
        sectorMap[sectorKey].total_hours += d.duration_hours;
        sectorMap[sectorKey].total_value += d.assigned_value;
      });

      // Add users to each sector
      Object.values(sectorMap).forEach(sector => {
        const sectorDetails = details.filter(d => (d.sector_id || 'sem-setor') === sector.sector_id);
        const userMap: Record<string, { user_id: string; user_name: string | null; total_shifts: number; total_hours: number; total_value: number }> = {};
        
        sectorDetails.forEach(d => {
          if (!userMap[d.user_id]) {
            userMap[d.user_id] = {
              user_id: d.user_id,
              user_name: d.user_name,
              total_shifts: 0,
              total_hours: 0,
              total_value: 0
            };
          }
          userMap[d.user_id].total_shifts++;
          userMap[d.user_id].total_hours += d.duration_hours;
          userMap[d.user_id].total_value += d.assigned_value;
        });
        
        sector.users = Object.values(userMap).sort((a, b) => b.total_value - a.total_value);
      });

      setSectorSummaries(Object.values(sectorMap).sort((a, b) => b.total_value - a.total_value));
    }

    setLoading(false);
  }

  function toggleSector(sectorId: string) {
    setExpandedSectors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectorId)) {
        newSet.delete(sectorId);
      } else {
        newSet.add(sectorId);
      }
      return newSet;
    });
  }

  function toggleUser(userId: string) {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }

  async function closePayment(userId: string, totalShifts: number, totalValue: number, totalHours: number) {
    if (!currentTenantId) return;
    
    const selectedStartDate = parseISO(startDate);
    const month = selectedStartDate.getMonth() + 1;
    const year = selectedStartDate.getFullYear();
    
    const { error } = await supabase
      .from('payments')
      .upsert({
        tenant_id: currentTenantId,
        user_id: userId,
        month,
        year,
        total_shifts: totalShifts,
        total_value: totalValue,
        total_hours: totalHours,
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: user?.id
      }, { onConflict: 'user_id,month,year' });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Período fechado!' });
      fetchData();
    }
  }

  function exportCSV() {
    const headers = ['Plantonista', 'Plantões', 'Carga Horária', 'Valor Total'];
    const rows = summaries.map(s => [
      s.user_name || 'N/A',
      s.total_shifts.toString(),
      s.total_hours.toFixed(1) + 'h',
      s.total_value.toFixed(2)
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-${startDate}-a-${endDate}.csv`;
    a.click();
  }

  function exportDetailedCSV() {
    const headers = ['Plantonista', 'Data', 'Local/Setor', 'Horário', 'Duração', 'Valor'];
    const rows = shiftDetails.map(s => [
      s.user_name,
      format(parseISO(s.shift_date), 'dd/MM/yyyy'),
      s.sector_name,
      `${s.start_time?.slice(0, 5) || ''} - ${s.end_time?.slice(0, 5) || ''}`,
      s.duration_hours.toFixed(1) + 'h',
      s.assigned_value.toFixed(2)
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantoes-detalhado-${startDate}-a-${endDate}.csv`;
    a.click();
  }

  function handlePrintReport() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Erro', description: 'Não foi possível abrir a janela de impressão', variant: 'destructive' });
      return;
    }

    const periodLabel = `${format(parseISO(startDate), 'dd/MM/yyyy')} a ${format(parseISO(endDate), 'dd/MM/yyyy')}`;
    
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
      const totalHours = shifts.reduce((sum, s) => sum + s.duration_hours, 0);
      
      shifts.forEach((shift, idx) => {
        tableRows += `
          <tr>
            ${idx === 0 ? `<td rowspan="${shifts.length}" style="vertical-align: top; font-weight: 600; border: 1px solid #ddd; padding: 8px; background: #f8f9fa;">${userName}<br><small style="font-weight: normal; color: #666;">${shifts.length} plantões<br>${totalHours.toFixed(1)}h</small></td>` : ''}
            <td style="border: 1px solid #ddd; padding: 8px;">${format(parseISO(shift.shift_date), 'dd/MM/yyyy')}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${shift.sector_name}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${shift.start_time?.slice(0, 5) || ''} - ${shift.end_time?.slice(0, 5) || ''}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${shift.duration_hours.toFixed(1)}h</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">R$ ${shift.assigned_value.toFixed(2)}</td>
            ${idx === 0 ? `<td rowspan="${shifts.length}" style="vertical-align: top; font-weight: 700; border: 1px solid #ddd; padding: 8px; background: #e8f5e9; text-align: right;">R$ ${totalValue.toFixed(2)}</td>` : ''}
          </tr>
        `;
      });
    });

    const grandTotalShifts = shiftDetails.length;
    const grandTotalHours = shiftDetails.reduce((sum, s) => sum + s.duration_hours, 0);
    const grandTotalValue = shiftDetails.reduce((sum, s) => sum + s.assigned_value, 0);
    const uniqueUsers = [...new Set(shiftDetails.map(s => s.user_id))].length;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório Financeiro - ${periodLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { margin-bottom: 5px; color: #1a1a1a; }
          h2 { color: #666; font-weight: normal; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th { background: #1a1a1a; color: white; padding: 8px; text-align: left; }
          .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
          .stat-card { padding: 15px 25px; background: #f5f5f5; border-radius: 8px; text-align: center; min-width: 120px; }
          .stat-number { font-size: 24px; font-weight: bold; }
          .stat-label { font-size: 11px; color: #666; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #999; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>Relatório Financeiro - ${currentTenantName || 'Hospital'}</h1>
        <h2>Período: ${periodLabel}</h2>

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
            <div class="stat-number">${grandTotalHours.toFixed(1)}h</div>
            <div class="stat-label">Carga Horária Total</div>
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
              <th>Duração</th>
              <th>Valor</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #666;">Nenhum plantão neste período</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Relatório gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </div>

        <script>window.onload = function() { window.print(); }</script>
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

    const periodLabel = `${format(parseISO(startDate), 'dd/MM/yyyy')} a ${format(parseISO(endDate), 'dd/MM/yyyy')}`;
    const userDetails = shiftDetails.filter(d => d.user_id === userSummary.user_id);

    let tableRows = userDetails.map(shift => `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${format(parseISO(shift.shift_date), 'EEEE, dd/MM/yyyy', { locale: ptBR })}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${shift.sector_name}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${shift.start_time?.slice(0, 5) || ''} - ${shift.end_time?.slice(0, 5) || ''}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${shift.duration_hours.toFixed(1)}h</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">R$ ${shift.assigned_value.toFixed(2)}</td>
      </tr>
    `).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Extrato - ${userSummary.user_name} - ${periodLabel}</title>
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
        <h2>${userSummary.user_name || 'Plantonista'} - ${periodLabel}</h2>

        <div class="summary">
          <div class="summary-row">
            <span>Total de Plantões:</span>
            <strong>${userSummary.total_shifts}</strong>
          </div>
          <div class="summary-row">
            <span>Carga Horária Total:</span>
            <strong>${userSummary.total_hours.toFixed(1)} horas</strong>
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
              <th>Duração</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #666;">Nenhum plantão</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background: #f5f5f5; font-weight: bold;">
              <td colspan="3" style="border: 1px solid #ddd; padding: 8px; text-align: right;">TOTAL:</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userSummary.total_hours.toFixed(1)}h</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">R$ ${userSummary.total_value.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          ${currentTenantName || 'Hospital'} - Extrato gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </div>

        <script>window.onload = function() { window.print(); }</script>
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
  const totalHoursAll = summaries.reduce((sum, s) => sum + s.total_hours, 0);
  const totalValueAll = summaries.reduce((sum, s) => sum + s.total_value, 0);

  if (loading) return <div className="text-muted-foreground p-4">Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Financeiro</h2>
          <p className="text-muted-foreground">Relatórios de plantões, carga horária e valores</p>
        </div>
      </div>

      {/* Date Range Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Selecionar Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Data Inicial</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Final</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={setLast7Days}>
                Últimos 7 dias
              </Button>
              <Button variant="outline" size="sm" onClick={setLast30Days}>
                Últimos 30 dias
              </Button>
              <Button variant="outline" size="sm" onClick={setThisMonth}>
                Este mês
              </Button>
              <Button variant="outline" size="sm" onClick={setLastMonth}>
                Mês passado
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{totalHoursAll.toFixed(1)}h</p>
                <p className="text-xs text-muted-foreground">Carga Horária</p>
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
                <p className="text-xs text-muted-foreground">Média/Plantonista</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
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

      {/* Tabs for different views */}
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">Por Plantonista</TabsTrigger>
          <TabsTrigger value="sectors">Por Setor</TabsTrigger>
          <TabsTrigger value="detailed">Todos os Plantões</TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>Resumo por Plantonista</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {summaries.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Nenhum dado para o período selecionado
                </div>
              ) : (
                <div className="divide-y">
                  {summaries.map(s => (
                    <div key={s.user_id}>
                      {/* User Header Row */}
                      <div 
                        className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => toggleUser(s.user_id)}
                      >
                        <div className="flex items-center gap-3">
                          {s.sectors.length > 0 ? (
                            expandedUsers.has(s.user_id) ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )
                          ) : (
                            <div className="w-5" />
                          )}
                          <div>
                            <h3 className="font-semibold text-foreground">{s.user_name || 'N/A'}</h3>
                            <p className="text-sm text-muted-foreground">
                              {s.sectors.length} setor{s.sectors.length !== 1 ? 'es' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 sm:gap-6">
                          <div className="text-center hidden sm:block">
                            <Badge variant="secondary">{s.total_shifts}</Badge>
                            <p className="text-xs text-muted-foreground mt-1">plantões</p>
                          </div>
                          <div className="text-center hidden sm:block">
                            <Badge variant="outline">{s.total_hours.toFixed(1)}h</Badge>
                            <p className="text-xs text-muted-foreground mt-1">horas</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-green-600">R$ {s.total_value.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">total</p>
                          </div>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => openUserDetails(s)}
                              title="Ver detalhes"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handlePrintUserDetail(s)}
                              title="Imprimir extrato"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => closePayment(s.user_id, s.total_shifts, s.total_value, s.total_hours)}
                              title="Fechar período"
                            >
                              <Lock className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Sector Breakdown */}
                      {expandedUsers.has(s.user_id) && s.sectors.length > 0 && (
                        <div className="bg-muted/30 border-t">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="pl-12">Setor</TableHead>
                                <TableHead className="text-center">Plantões</TableHead>
                                <TableHead className="text-center">Carga Horária</TableHead>
                                <TableHead className="text-right pr-6">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {s.sectors.map(sector => (
                                <TableRow key={sector.sector_id} className="bg-background/50">
                                  <TableCell className="pl-12">
                                    <div className="flex items-center gap-2">
                                      <Building className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-medium">{sector.sector_name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="secondary">{sector.total_shifts}</Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="outline">{sector.total_hours.toFixed(1)}h</Badge>
                                  </TableCell>
                                  <TableCell className="text-right pr-6 font-semibold text-green-600">
                                    R$ {sector.total_value.toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sectors Tab */}
        <TabsContent value="sectors">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Resumo por Setor
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sectorSummaries.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Nenhum dado para o período selecionado
                </div>
              ) : (
                <div className="divide-y">
                  {sectorSummaries.map(sector => (
                    <div key={sector.sector_id}>
                      {/* Sector Header */}
                      <div 
                        className="flex items-center justify-between p-4 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleSector(sector.sector_id)}
                      >
                        <div className="flex items-center gap-3">
                          {expandedSectors.has(sector.sector_id) ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <h3 className="font-semibold text-foreground">{sector.sector_name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {sector.users.length} plantonista{sector.users.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-center">
                            <p className="font-semibold">{sector.total_shifts}</p>
                            <p className="text-xs text-muted-foreground">plantões</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold">{sector.total_hours.toFixed(1)}h</p>
                            <p className="text-xs text-muted-foreground">horas</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-green-600">R$ {sector.total_value.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">total</p>
                          </div>
                        </div>
                      </div>

                      {/* Sector Users */}
                      {expandedSectors.has(sector.sector_id) && (
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-background">
                              <TableHead className="pl-12">Plantonista</TableHead>
                              <TableHead className="text-center">Plantões</TableHead>
                              <TableHead className="text-center">Carga Horária</TableHead>
                              <TableHead className="text-right pr-6">Valor a Receber</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sector.users.map(u => (
                              <TableRow key={u.user_id} className="bg-background">
                                <TableCell className="pl-12 font-medium">{u.user_name || 'N/A'}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="secondary">{u.total_shifts}</Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline">{u.total_hours.toFixed(1)}h</Badge>
                                </TableCell>
                                <TableCell className="text-right pr-6 font-semibold text-green-600">
                                  R$ {u.total_value.toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
                    <TableHead className="text-center">Duração</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftDetails.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                        <TableCell className="text-center">
                          <Badge variant="outline">{detail.duration_hours.toFixed(1)}h</Badge>
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
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Plantões</p>
                        <p className="text-2xl font-bold">{selectedUser.total_shifts}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Carga Horária</p>
                        <p className="text-2xl font-bold">{selectedUser.total_hours.toFixed(1)}h</p>
                      </div>
                      <div>
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
                      <TableHead className="text-center">Duração</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shiftDetails
                      .filter(d => d.user_id === selectedUser.user_id)
                      .map(detail => (
                        <TableRow key={detail.id}>
                          <TableCell>
                            {detail.shift_date && format(parseISO(detail.shift_date), "EEE, dd/MM", { locale: ptBR })}
                          </TableCell>
                          <TableCell>{detail.sector_name}</TableCell>
                          <TableCell>
                            {detail.start_time?.slice(0, 5)} - {detail.end_time?.slice(0, 5)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{detail.duration_hours.toFixed(1)}h</Badge>
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
