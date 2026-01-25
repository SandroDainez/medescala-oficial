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
import { Download, DollarSign, Users, Calendar, Filter, ChevronDown, ChevronRight, Building, AlertCircle, FileText, Printer, Clock, Eye, Calculator, Table2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import SectorProfitability from '@/components/admin/SectorProfitability';

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
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
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

  // Export plantonista detail to CSV
  function exportPlantonistaCSV(p: PlantonistaReport) {
    const headers = ['Data', 'Horário', 'Duração (h)', 'Setor', 'Valor'];
    const sortedEntries = (p.entries ?? [])
      .slice()
      .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || (a.start_time || '').localeCompare(b.start_time || ''));
    
    const rows = sortedEntries.map(e => {
      const val = e.value_source === 'invalid' ? null : e.final_value;
      return [
        format(parseISO(e.shift_date), 'dd/MM/yyyy'),
        `${e.start_time?.slice(0, 5) || ''} - ${e.end_time?.slice(0, 5) || ''}`,
        e.duration_hours.toFixed(1),
        e.sector_name,
        val !== null ? val.toFixed(2) : 'Sem valor',
      ];
    });
    rows.push(['', '', '', 'TOTAL', p.total_to_receive.toFixed(2)]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantoes-${p.assignee_name.replace(/\s+/g, '_')}-${startDate}-a-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Print plantonista detail
  function printPlantonistaDetail(p: PlantonistaReport) {
    const sortedEntries = (p.entries ?? [])
      .slice()
      .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || (a.start_time || '').localeCompare(b.start_time || ''));

    const tableRows = sortedEntries.map(e => {
      const val = e.value_source === 'invalid' ? null : e.final_value;
      return `
        <tr>
          <td>${format(parseISO(e.shift_date), 'dd/MM/yyyy (EEE)', { locale: ptBR })}</td>
          <td>${e.start_time?.slice(0, 5) || ''} - ${e.end_time?.slice(0, 5) || ''}</td>
          <td class="center">${e.duration_hours.toFixed(1)}h</td>
          <td>${e.sector_name}</td>
          <td class="right">${val !== null ? formatCurrency(val) : '<span class="no-value">Sem valor</span>'}</td>
        </tr>
      `;
    }).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Plantões - ${p.assignee_name}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            padding: 20px; 
            color: #333;
            font-size: 12px;
          }
          .header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #22c55e;
          }
          h1 { font-size: 20px; font-weight: 600; color: #1a1a1a; margin-bottom: 5px; }
          .subtitle { font-size: 14px; color: #666; }
          .summary {
            display: flex;
            gap: 20px;
            margin-bottom: 15px;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 6px;
          }
          .summary-item { font-size: 12px; }
          .summary-item strong { color: #1a1a1a; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f8f9fa; padding: 10px 8px; text-align: left; font-weight: 600; font-size: 11px; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; color: #555; }
          td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) { background: #fafafa; }
          .center { text-align: center; }
          .right { text-align: right; }
          .total-row { font-weight: bold; background: #f0fdf4 !important; }
          .total-row td { border-top: 2px solid #22c55e; padding-top: 12px; }
          .total-value { font-size: 16px; color: #16a34a; }
          .no-value { color: #f59e0b; font-size: 10px; }
          .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; color: #999; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${p.assignee_name}</h1>
          <p class="subtitle">${format(parseISO(startDate), 'dd/MM/yyyy')} a ${format(parseISO(endDate), 'dd/MM/yyyy')}</p>
        </div>

        <div class="summary">
          <div class="summary-item"><strong>${p.total_shifts}</strong> plantões</div>
          <div class="summary-item"><strong>${p.total_hours.toFixed(1)}h</strong> horas</div>
          ${p.unpriced_shifts > 0 ? `<div class="summary-item"><strong>${p.unpriced_shifts}</strong> sem valor</div>` : ''}
          <div class="summary-item"><strong>${formatCurrency(p.total_to_receive)}</strong> total</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Horário</th>
              <th class="center">Duração</th>
              <th>Setor</th>
              <th class="right">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            <tr class="total-row">
              <td colspan="4" class="right"><strong>TOTAL</strong></td>
              <td class="right total-value">${formatCurrency(p.total_to_receive)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }
  // Unique sectors and plantonistas for filters
  const sectors = useMemo(() => {
    const map = new Map<string, string>();
    rawEntries.forEach(e => {
      if (e.sector_id) map.set(e.sector_id, e.sector_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawEntries]);

  // Plantonistas filtrados pelo setor selecionado
  const plantonistas = useMemo(() => {
    const map = new Map<string, string>();
    const entriesToUse = filterSetor === 'all' 
      ? rawEntries 
      : rawEntries.filter(e => e.sector_id === filterSetor);
    
    entriesToUse.forEach(e => {
      map.set(e.assignee_id, e.assignee_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawEntries, filterSetor]);

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

    try {
      // Fetch shifts, assignments via RPC, sectors, user overrides, and tenant info in parallel
      const [shiftsRes, assignmentsRes, sectorsRes, userValuesRes, tenantRes] = await Promise.all([
        supabase
          .from('shifts')
          .select('id, shift_date, start_time, end_time, sector_id, base_value')
          .eq('tenant_id', currentTenantId)
          .gte('shift_date', startDate)
          .lte('shift_date', endDate)
          .order('shift_date', { ascending: true })
          .order('start_time', { ascending: true }),
        // Use RPC to avoid URL length limit with .in(...ids...)
        supabase.rpc('get_shift_assignments_range', {
          _tenant_id: currentTenantId,
          _start: startDate,
          _end: endDate,
        }),
        supabase
          .from('sectors')
          .select('id, name, default_day_value, default_night_value')
          .eq('tenant_id', currentTenantId)
          .eq('active', true),
        supabase
          .from('user_sector_values')
          .select('sector_id, user_id, day_value, night_value')
          .eq('tenant_id', currentTenantId),
        supabase
          .from('tenants')
          .select('slug')
          .eq('id', currentTenantId)
          .single(),
      ]);

      if (shiftsRes.error) {
        console.error('[AdminFinancial] Fetch shifts error:', shiftsRes.error);
        setRawEntries([]);
        setLoading(false);
        return;
      }

      if (assignmentsRes.error) {
        console.error('[AdminFinancial] Fetch assignments error:', assignmentsRes.error);
        setRawEntries([]);
        setLoading(false);
        return;
      }

      if (sectorsRes.error) {
        console.error('[AdminFinancial] Fetch sectors error:', sectorsRes.error);
        // proceed without sector names
      }

      // Get tenant slug for GABS-specific rules
      const slug = tenantRes.data?.slug ?? null;
      setTenantSlug(slug);

      const shifts = shiftsRes.data ?? [];
      const assignmentsRaw = (assignmentsRes.data ?? []) as Array<{
        id: string;
        shift_id: string;
        user_id: string;
        assigned_value: number | null;
        status: string;
        name: string | null;
      }>;
      const sectors = sectorsRes.data ?? [];
      const userValues = (userValuesRes.data ?? []) as Array<{
        sector_id: string;
        user_id: string;
        day_value: number | null;
        night_value: number | null;
      }>;

      const mapped = mapScheduleToFinancialEntries({
        shifts: shifts as unknown as ScheduleShift[],
        assignments: assignmentsRaw.map(
          (a): ScheduleAssignment => ({
            id: a.id,
            shift_id: a.shift_id,
            user_id: a.user_id,
            assigned_value: a.assigned_value !== null ? Number(a.assigned_value) : null,
            profile_name: a.name ?? null,
          })
        ),
        sectors: sectors as unknown as SectorLookup[],
        userSectorValues: userValues,
        tenantSlug: slug ?? undefined,
      });

      setRawEntries(mapped);
    } catch (err) {
      console.error('[AdminFinancial] Unexpected error:', err);
      setRawEntries([]);
    } finally {
      setLoading(false);
    }
  }

  // Filtered entries
  const filteredEntries = useMemo(() => {
    console.log('[filteredEntries] Computing with filterPlantonista:', filterPlantonista, 'filterSetor:', filterSetor);
    console.log('[filteredEntries] rawEntries count:', rawEntries.length);
    
    const result = rawEntries.filter(e => {
      if (filterSetor !== 'all' && e.sector_id !== filterSetor) return false;
      if (filterPlantonista !== 'all' && e.assignee_id !== filterPlantonista) return false;
      return true;
    });
    
    console.log('[filteredEntries] Result count:', result.length);
    if (filterPlantonista !== 'all') {
      console.log('[filteredEntries] Looking for assignee_id:', filterPlantonista);
      console.log('[filteredEntries] Available assignee_ids:', [...new Set(rawEntries.map(e => e.assignee_id))]);
    }
    
    return result;
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
  // Export CSV - Dia a Dia (detailed)
  function exportCSVDiario() {
    const headers = ['Data', 'Horário', 'Duração (h)', 'Setor', 'Plantonista', 'Valor'];
    const rows = filteredEntries
      .slice()
      .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || (a.start_time || '').localeCompare(b.start_time || ''))
      .map(e => {
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
    
    const plantonistaName = filterPlantonista !== 'all' 
      ? plantonistas.find(p => p.id === filterPlantonista)?.name?.replace(/\s+/g, '_') ?? 'filtrado'
      : 'todos';
    const setorName = filterSetor !== 'all'
      ? sectors.find(s => s.id === filterSetor)?.name?.replace(/\s+/g, '_') ?? 'filtrado'
      : 'todos';
    
    a.download = `financeiro-diario-${startDate}-a-${endDate}-${plantonistaName}-${setorName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export CSV - Totais por Plantonista (summary view)
  function exportCSVPlantonistas() {
    const headers = ['Plantonista', 'Plantões', 'Horas', 'Sem Valor', 'Total'];
    const rows = plantonistaReports
      .slice()
      .sort((a, b) => a.assignee_name.localeCompare(b.assignee_name))
      .map(p => [
        p.assignee_name,
        p.total_shifts.toString(),
        p.total_hours.toFixed(1),
        p.unpriced_shifts.toString(),
        p.total_to_receive > 0 ? p.total_to_receive.toFixed(2) : '0.00',
      ]);
    rows.push(['TOTAL', grandTotals.totalShifts.toString(), grandTotals.totalHours.toFixed(1), grandTotals.unpricedShifts.toString(), grandTotals.totalValue.toFixed(2)]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const setorName = filterSetor !== 'all'
      ? sectors.find(s => s.id === filterSetor)?.name?.replace(/\s+/g, '_') ?? 'filtrado'
      : 'todos';
    
    a.download = `financeiro-plantonistas-${startDate}-a-${endDate}-${setorName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Print Dia a Dia - detailed view
  function handlePrintDiario() {
    const plantonistaName = filterPlantonista !== 'all' 
      ? plantonistas.find(p => p.id === filterPlantonista)?.name ?? 'Filtrado'
      : 'Todos os plantonistas';
    const setorName = filterSetor !== 'all'
      ? sectors.find(s => s.id === filterSetor)?.name ?? 'Filtrado'
      : 'Todos os setores';

    const sortedEntries = filteredEntries
      .slice()
      .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || (a.start_time || '').localeCompare(b.start_time || ''));

    const tableRows = sortedEntries.map(e => {
      const val = e.value_source === 'invalid' ? null : e.final_value;
      return `
        <tr>
          <td>${format(parseISO(e.shift_date), 'dd/MM/yyyy')}</td>
          <td>${e.start_time?.slice(0, 5) || ''} - ${e.end_time?.slice(0, 5) || ''}</td>
          <td class="center">${e.duration_hours.toFixed(1)}h</td>
          <td>${e.sector_name}</td>
          <td>${e.assignee_name}</td>
          <td class="right">${val !== null ? formatCurrency(val) : '<span class="no-value">Sem valor</span>'}</td>
        </tr>
      `;
    }).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório Financeiro - Dia a Dia - ${startDate} a ${endDate}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            padding: 20px; 
            color: #333;
            background: #fff;
            font-size: 12px;
          }
          .header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #22c55e;
          }
          h1 { 
            font-size: 20px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 5px;
          }
          .subtitle {
            font-size: 14px;
            color: #666;
          }
          .filters {
            margin-bottom: 15px;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 6px;
            font-size: 11px;
          }
          .filters span {
            margin-right: 20px;
          }
          .stats { 
            display: flex; 
            gap: 15px; 
            margin-bottom: 20px; 
          }
          .stat-card { 
            padding: 12px 18px; 
            background: #f5f5f5; 
            border-radius: 8px; 
            text-align: center;
            flex: 1;
          }
          .stat-number { font-size: 18px; font-weight: bold; color: #1a1a1a; }
          .stat-label { font-size: 10px; color: #666; text-transform: uppercase; margin-top: 2px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background: #f8f9fa;
            padding: 10px 8px;
            text-align: left;
            font-weight: 600;
            font-size: 11px;
            border-bottom: 2px solid #e5e7eb;
            text-transform: uppercase;
            color: #555;
          }
          td {
            padding: 8px;
            border-bottom: 1px solid #e5e7eb;
          }
          tr:nth-child(even) {
            background: #fafafa;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .total-row {
            font-weight: bold;
            background: #f0fdf4 !important;
          }
          .total-row td {
            border-top: 2px solid #22c55e;
            padding-top: 12px;
          }
          .total-value {
            font-size: 16px;
            color: #16a34a;
          }
          .no-value {
            color: #f59e0b;
            font-size: 10px;
          }
          .footer { 
            margin-top: 20px; 
            padding-top: 10px; 
            border-top: 1px solid #ddd; 
            font-size: 10px; 
            color: #999;
            display: flex;
            justify-content: space-between;
          }
          @media print {
            body { padding: 10px; }
            .stat-card { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Relatório Financeiro — Dia a Dia</h1>
          <p class="subtitle">${format(parseISO(startDate), 'dd/MM/yyyy')} a ${format(parseISO(endDate), 'dd/MM/yyyy')}</p>
        </div>

        <div class="filters">
          <span><strong>Setor:</strong> ${setorName}</span>
          <span><strong>Plantonista:</strong> ${plantonistaName}</span>
        </div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-number">${grandTotals.totalPlantonistas}</div>
            <div class="stat-label">Plantonistas</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${grandTotals.totalShifts}</div>
            <div class="stat-label">Plantões</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${grandTotals.totalHours.toFixed(1)}h</div>
            <div class="stat-label">Horas</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${grandTotals.unpricedShifts}</div>
            <div class="stat-label">Sem Valor</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #16a34a;">${formatCurrency(grandTotals.totalValue)}</div>
            <div class="stat-label">Total</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Horário</th>
              <th class="center">Duração</th>
              <th>Setor</th>
              <th>Plantonista</th>
              <th class="right">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            <tr class="total-row">
              <td colspan="5" class="right">TOTAL GERAL</td>
              <td class="right total-value">${formatCurrency(grandTotals.totalValue)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <span>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</span>
          <span>${filteredEntries.length} registros</span>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }

  // Print Plantonistas - summary view matching the table on screen
  function handlePrintPlantonistas() {
    const setorName = filterSetor !== 'all'
      ? sectors.find(s => s.id === filterSetor)?.name ?? 'Filtrado'
      : 'Todos os setores';

    const sortedReports = plantonistaReports
      .slice()
      .sort((a, b) => a.assignee_name.localeCompare(b.assignee_name));

    const tableRows = sortedReports.map(p => `
      <tr>
        <td>${p.assignee_name}</td>
        <td class="center">${p.total_shifts}</td>
        <td class="center">${p.total_hours.toFixed(1)}h</td>
        <td class="center">${p.unpriced_shifts > 0 ? `<span class="no-value">${p.unpriced_shifts}</span>` : '0'}</td>
        <td class="right">${p.total_to_receive > 0 ? formatCurrency(p.total_to_receive) : '<span class="no-value">—</span>'}</td>
      </tr>
    `).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório Financeiro - Plantonistas - ${startDate} a ${endDate}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            padding: 20px; 
            color: #333;
            background: #fff;
            font-size: 12px;
          }
          .header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #22c55e;
          }
          h1 { 
            font-size: 20px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 5px;
          }
          .subtitle {
            font-size: 14px;
            color: #666;
          }
          .filters {
            margin-bottom: 15px;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 6px;
            font-size: 11px;
          }
          .filters span {
            margin-right: 20px;
          }
          .stats { 
            display: flex; 
            gap: 15px; 
            margin-bottom: 20px; 
          }
          .stat-card { 
            padding: 12px 18px; 
            background: #f5f5f5; 
            border-radius: 8px; 
            text-align: center;
            flex: 1;
          }
          .stat-number { font-size: 18px; font-weight: bold; color: #1a1a1a; }
          .stat-label { font-size: 10px; color: #666; text-transform: uppercase; margin-top: 2px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background: #f8f9fa;
            padding: 10px 8px;
            text-align: left;
            font-weight: 600;
            font-size: 11px;
            border-bottom: 2px solid #e5e7eb;
            text-transform: uppercase;
            color: #555;
          }
          td {
            padding: 8px;
            border-bottom: 1px solid #e5e7eb;
          }
          tr:nth-child(even) {
            background: #fafafa;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .total-row {
            font-weight: bold;
            background: #f0fdf4 !important;
          }
          .total-row td {
            border-top: 2px solid #22c55e;
            padding-top: 12px;
          }
          .total-value {
            font-size: 16px;
            color: #16a34a;
          }
          .no-value {
            color: #f59e0b;
            font-size: 10px;
          }
          .footer { 
            margin-top: 20px; 
            padding-top: 10px; 
            border-top: 1px solid #ddd; 
            font-size: 10px; 
            color: #999;
            display: flex;
            justify-content: space-between;
          }
          @media print {
            body { padding: 10px; }
            .stat-card { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Relatório Financeiro — Plantonistas</h1>
          <p class="subtitle">${format(parseISO(startDate), 'dd/MM/yyyy')} a ${format(parseISO(endDate), 'dd/MM/yyyy')}</p>
        </div>

        <div class="filters">
          <span><strong>Setor:</strong> ${setorName}</span>
        </div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-number">${grandTotals.totalPlantonistas}</div>
            <div class="stat-label">Plantonistas</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${grandTotals.totalShifts}</div>
            <div class="stat-label">Plantões</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${grandTotals.totalHours.toFixed(1)}h</div>
            <div class="stat-label">Horas</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${grandTotals.unpricedShifts}</div>
            <div class="stat-label">Sem Valor</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #16a34a;">${formatCurrency(grandTotals.totalValue)}</div>
            <div class="stat-label">Total</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Plantonista</th>
              <th class="center">Plantões</th>
              <th class="center">Horas</th>
              <th class="center">Sem Valor</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            <tr class="total-row">
              <td class="right"><strong>TOTAL GERAL</strong></td>
              <td class="center"><strong>${grandTotals.totalShifts}</strong></td>
              <td class="center"><strong>${grandTotals.totalHours.toFixed(1)}h</strong></td>
              <td class="center"><strong>${grandTotals.unpricedShifts}</strong></td>
              <td class="right total-value">${formatCurrency(grandTotals.totalValue)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <span>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</span>
          <span>${plantonistaReports.length} plantonistas</span>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCSVPlantonistas}>
                <Users className="h-4 w-4 mr-2" />
                Totais por Plantonista
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCSVDiario}>
                <Table2 className="h-4 w-4 mr-2" />
                Dia a Dia (Detalhado)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handlePrintPlantonistas}>
                <Users className="h-4 w-4 mr-2" />
                Totais por Plantonista
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrintDiario}>
                <Table2 className="h-4 w-4 mr-2" />
                Dia a Dia (Detalhado)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              <Select value={filterSetor} onValueChange={(value) => {
                setFilterSetor(value);
                // Reset plantonista filter when sector changes (plantonista may not exist in new sector)
                setFilterPlantonista('all');
              }}>
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

      {/* TABS: Plantonistas | Balanço dos Setores */}
      <Tabs defaultValue="plantonistas_tabela" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="plantonistas_tabela">Plantonistas</TabsTrigger>
          <TabsTrigger value="rentabilidade" className="flex items-center gap-1">
            <Calculator className="h-3 w-3" />
            Balanço dos Setores
          </TabsTrigger>
        </TabsList>

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
                <div className="flex items-center justify-between">
                  <DialogTitle>
                    {selectedPlantonista?.assignee_name}
                  </DialogTitle>
                  <div className="flex gap-2 mr-8">
                    <Button variant="outline" size="sm" onClick={() => selectedPlantonista && exportPlantonistaCSV(selectedPlantonista)}>
                      <Download className="h-4 w-4 mr-1" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => selectedPlantonista && printPlantonistaDetail(selectedPlantonista)}>
                      <Printer className="h-4 w-4 mr-1" />
                      Imprimir
                    </Button>
                  </div>
                </div>
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


        {/* TAB: Rentabilidade por Setor */}
        <TabsContent value="rentabilidade" className="mt-4">
          <SectorProfitability />
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
