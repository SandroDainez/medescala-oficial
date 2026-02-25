import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, Trash2, Edit, Save, Building, DollarSign, TrendingUp, TrendingDown, 
  Receipt, ChevronDown, ChevronRight, Download, Printer, Calculator
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

interface SectorRevenue {
  id: string;
  sector_id: string;
  month: number;
  year: number;
  fixed_revenue: number;
  variable_revenue: number;
  notes: string | null;
}

interface SectorExpense {
  id: string;
  sector_id: string;
  month: number;
  year: number;
  expense_type: 'tax' | 'general' | 'specific';
  expense_name: string;
  amount: number;
  notes: string | null;
}

interface PlantonistaPayment {
  sector_id: string;
  sector_name: string;
  total_value: number;
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function SectorProfitability() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();

  // Date selection
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Data
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [revenues, setRevenues] = useState<SectorRevenue[]>([]);
  const [expenses, setExpenses] = useState<SectorExpense[]>([]);
  const [plantonistaPayments, setPlantonistaPayments] = useState<PlantonistaPayment[]>([]);
  const [loading, setLoading] = useState(true);

  // UI State
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [editRevenueDialogOpen, setEditRevenueDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [revenueForm, setRevenueForm] = useState({ fixed_revenue: '', variable_revenue: '', notes: '' });
  
  const [addExpenseDialogOpen, setAddExpenseDialogOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ 
    expense_type: 'specific' as 'tax' | 'general' | 'specific', 
    expense_name: '', 
    amount: '', 
    notes: '' 
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);

    try {
      const startDate = format(new Date(selectedYear, selectedMonth - 1, 1), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(new Date(selectedYear, selectedMonth - 1, 1)), 'yyyy-MM-dd');

      const [sectorsRes, revenuesRes, expensesRes, shiftsRes, assignmentsRes] = await Promise.all([
        supabase
          .from('sectors')
          .select('id, name, color')
          .eq('tenant_id', currentTenantId)
          .eq('active', true)
          .order('name'),
        supabase
          .from('sector_revenues')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .eq('month', selectedMonth)
          .eq('year', selectedYear),
        supabase
          .from('sector_expenses')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .eq('month', selectedMonth)
          .eq('year', selectedYear)
          .order('expense_type', { ascending: true })
          .order('expense_name', { ascending: true }),
        // For calculating plantonista payments per sector
        supabase
          .from('shifts')
          .select('id, sector_id')
          .eq('tenant_id', currentTenantId)
          .gte('shift_date', startDate)
          .lte('shift_date', endDate),
        supabase.rpc('get_shift_assignments_range', {
          _tenant_id: currentTenantId,
          _start: startDate,
          _end: endDate,
        }),
      ]);

      if (sectorsRes.error) throw sectorsRes.error;
      if (revenuesRes.error) throw revenuesRes.error;
      if (expensesRes.error) throw expensesRes.error;

      setSectors(sectorsRes.data ?? []);
      setRevenues(revenuesRes.data ?? []);
      setExpenses(expensesRes.data as SectorExpense[] ?? []);

      // Calculate plantonista payments per sector
      const shifts = shiftsRes.data ?? [];
      const assignments = (assignmentsRes.data ?? []) as Array<{ shift_id: string; assigned_value: number | null }>;
      
      const paymentsBySector = new Map<string, number>();
      
      assignments.forEach(assignment => {
        const shift = shifts.find(s => s.id === assignment.shift_id);
        if (shift?.sector_id && assignment.assigned_value) {
          const current = paymentsBySector.get(shift.sector_id) || 0;
          paymentsBySector.set(shift.sector_id, current + Number(assignment.assigned_value));
        }
      });

      const payments: PlantonistaPayment[] = [];
      paymentsBySector.forEach((total_value, sector_id) => {
        const sector = sectorsRes.data?.find(s => s.id === sector_id);
        if (sector) {
          payments.push({ sector_id, sector_name: sector.name, total_value });
        }
      });
      setPlantonistaPayments(payments);

    } catch (error: any) {
      console.error('Error fetching sector profitability data:', error);
      toast({ title: 'Erro ao carregar dados', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, selectedMonth, selectedYear, toast]);

  useEffect(() => {
    if (currentTenantId) fetchData();
  }, [currentTenantId, fetchData]);

  // Get revenue for a sector
  const getSectorRevenue = useCallback((sectorId: string): SectorRevenue | undefined => {
    return revenues.find(r => r.sector_id === sectorId);
  }, [revenues]);

  // Get expenses for a sector
  const getSectorExpenses = useCallback((sectorId: string): SectorExpense[] => {
    return expenses.filter(e => e.sector_id === sectorId);
  }, [expenses]);

  // Get plantonista payment for a sector
  const getPlantonistaPayment = useCallback((sectorId: string): number => {
    return plantonistaPayments.find(p => p.sector_id === sectorId)?.total_value || 0;
  }, [plantonistaPayments]);

  // Calculate sector financials
  const calculateSectorFinancials = useCallback((sectorId: string) => {
    const revenue = getSectorRevenue(sectorId);
    const sectorExpenses = getSectorExpenses(sectorId);
    const plantonistaPayment = getPlantonistaPayment(sectorId);

    const fixedRevenue = Number(revenue?.fixed_revenue || 0);
    const variableRevenue = Number(revenue?.variable_revenue || 0);
    const totalRevenue = fixedRevenue + variableRevenue;

    const taxExpenses = sectorExpenses.filter(e => e.expense_type === 'tax').reduce((sum, e) => sum + Number(e.amount), 0);
    const generalExpenses = sectorExpenses.filter(e => e.expense_type === 'general').reduce((sum, e) => sum + Number(e.amount), 0);
    const specificExpenses = sectorExpenses.filter(e => e.expense_type === 'specific').reduce((sum, e) => sum + Number(e.amount), 0);
    const totalExpenses = taxExpenses + generalExpenses + specificExpenses;

    const profit = totalRevenue - totalExpenses - plantonistaPayment;

    return {
      fixedRevenue,
      variableRevenue,
      totalRevenue,
      taxExpenses,
      generalExpenses,
      specificExpenses,
      totalExpenses,
      plantonistaPayment,
      profit,
    };
  }, [getSectorRevenue, getSectorExpenses, getPlantonistaPayment]);

  // Grand totals
  const grandTotals = useMemo(() => {
    let totalFixedRevenue = 0;
    let totalVariableRevenue = 0;
    let totalTaxExpenses = 0;
    let totalGeneralExpenses = 0;
    let totalSpecificExpenses = 0;
    let totalPlantonistaPayments = 0;
    let totalProfit = 0;

    sectors.forEach(sector => {
      const financials = calculateSectorFinancials(sector.id);
      totalFixedRevenue += financials.fixedRevenue;
      totalVariableRevenue += financials.variableRevenue;
      totalTaxExpenses += financials.taxExpenses;
      totalGeneralExpenses += financials.generalExpenses;
      totalSpecificExpenses += financials.specificExpenses;
      totalPlantonistaPayments += financials.plantonistaPayment;
      totalProfit += financials.profit;
    });

    return {
      totalRevenue: totalFixedRevenue + totalVariableRevenue,
      totalFixedRevenue,
      totalVariableRevenue,
      totalExpenses: totalTaxExpenses + totalGeneralExpenses + totalSpecificExpenses,
      totalTaxExpenses,
      totalGeneralExpenses,
      totalSpecificExpenses,
      totalPlantonistaPayments,
      totalProfit,
    };
  }, [sectors, calculateSectorFinancials]);

  // Toggle sector expansion
  function toggleSector(sectorId: string) {
    setExpandedSectors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectorId)) newSet.delete(sectorId);
      else newSet.add(sectorId);
      return newSet;
    });
  }

  // Open revenue edit dialog
  function openRevenueDialog(sector: Sector) {
    const revenue = getSectorRevenue(sector.id);
    setEditingSector(sector);
    setRevenueForm({
      fixed_revenue: revenue?.fixed_revenue?.toString() || '',
      variable_revenue: revenue?.variable_revenue?.toString() || '',
      notes: revenue?.notes || '',
    });
    setEditRevenueDialogOpen(true);
  }

  // Save revenue
  async function handleSaveRevenue() {
    if (!editingSector || !currentTenantId || !user?.id) return;

    try {
      const existingRevenue = getSectorRevenue(editingSector.id);

      if (existingRevenue) {
        const { error } = await supabase
          .from('sector_revenues')
          .update({
            fixed_revenue: parseFloat(revenueForm.fixed_revenue) || 0,
            variable_revenue: parseFloat(revenueForm.variable_revenue) || 0,
            notes: revenueForm.notes || null,
            updated_by: user.id,
          })
          .eq('id', existingRevenue.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sector_revenues')
          .insert({
            tenant_id: currentTenantId,
            sector_id: editingSector.id,
            month: selectedMonth,
            year: selectedYear,
            fixed_revenue: parseFloat(revenueForm.fixed_revenue) || 0,
            variable_revenue: parseFloat(revenueForm.variable_revenue) || 0,
            notes: revenueForm.notes || null,
            created_by: user.id,
            updated_by: user.id,
          });

        if (error) throw error;
      }

      toast({ title: 'Receitas salvas!' });
      setEditRevenueDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error?.message, variant: 'destructive' });
    }
  }

  // Open expense dialog
  function openExpenseDialog(sector: Sector) {
    setEditingSector(sector);
    setExpenseForm({ expense_type: 'specific', expense_name: '', amount: '', notes: '' });
    setAddExpenseDialogOpen(true);
  }

  // Save expense
  async function handleSaveExpense() {
    if (!editingSector || !currentTenantId || !user?.id) return;

    if (!expenseForm.expense_name.trim() || !expenseForm.amount) {
      toast({ title: 'Preencha o nome e valor da despesa', variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase
        .from('sector_expenses')
        .insert({
          tenant_id: currentTenantId,
          sector_id: editingSector.id,
          month: selectedMonth,
          year: selectedYear,
          expense_type: expenseForm.expense_type,
          expense_name: expenseForm.expense_name.trim(),
          amount: parseFloat(expenseForm.amount) || 0,
          notes: expenseForm.notes || null,
          created_by: user.id,
          updated_by: user.id,
        });

      if (error) throw error;

      toast({ title: 'Despesa adicionada!' });
      setAddExpenseDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error?.message, variant: 'destructive' });
    }
  }

  // Delete expense
  async function handleDeleteExpense(expenseId: string) {
    if (!confirm('Deseja excluir esta despesa?')) return;

    try {
      const { error } = await supabase
        .from('sector_expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw error;

      toast({ title: 'Despesa excluída!' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro ao excluir', description: error?.message, variant: 'destructive' });
    }
  }

  // Export to CSV
  function exportCSV() {
    const headers = ['Setor', 'Receita Fixa', 'Receita Variável', 'Total Receitas', 'Impostos', 'Gastos Gerais', 'Gastos Específicos', 'Total Despesas', 'Pagamento Plantonistas', 'Lucro'];
    const rows = sectors.map(sector => {
      const f = calculateSectorFinancials(sector.id);
      return [
        sector.name,
        f.fixedRevenue.toFixed(2),
        f.variableRevenue.toFixed(2),
        f.totalRevenue.toFixed(2),
        f.taxExpenses.toFixed(2),
        f.generalExpenses.toFixed(2),
        f.specificExpenses.toFixed(2),
        f.totalExpenses.toFixed(2),
        f.plantonistaPayment.toFixed(2),
        f.profit.toFixed(2),
      ];
    });
    rows.push([
      'TOTAL',
      grandTotals.totalFixedRevenue.toFixed(2),
      grandTotals.totalVariableRevenue.toFixed(2),
      grandTotals.totalRevenue.toFixed(2),
      grandTotals.totalTaxExpenses.toFixed(2),
      grandTotals.totalGeneralExpenses.toFixed(2),
      grandTotals.totalSpecificExpenses.toFixed(2),
      grandTotals.totalExpenses.toFixed(2),
      grandTotals.totalPlantonistaPayments.toFixed(2),
      grandTotals.totalProfit.toFixed(2),
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentabilidade-setores-${selectedMonth}-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const monthName = format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: ptBR });

  // Generate month options
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: format(new Date(2024, i), 'MMMM', { locale: ptBR }),
  }));

  // Generate year options (current year and 2 years back)
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Rentabilidade por Setor
          </h2>
          <p className="text-muted-foreground text-sm">{monthName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => (
                <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Grand Totals Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Receita Total</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(grandTotals.totalRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Receipt className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Despesas</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(grandTotals.totalExpenses)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Plantonistas</p>
                <p className="text-lg font-bold text-blue-600">{formatCurrency(grandTotals.totalPlantonistaPayments)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={grandTotals.totalProfit >= 0 ? 'border-green-500' : 'border-red-500'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${grandTotals.totalProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {grandTotals.totalProfit >= 0 
                  ? <TrendingUp className="h-5 w-5 text-green-600" />
                  : <TrendingDown className="h-5 w-5 text-red-600" />
                }
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lucro</p>
                <p className={`text-lg font-bold ${grandTotals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(grandTotals.totalProfit)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sectors List */}
      <div className="space-y-4">
        {sectors.map(sector => {
          const isExpanded = expandedSectors.has(sector.id);
          const financials = calculateSectorFinancials(sector.id);
          const sectorExpenses = getSectorExpenses(sector.id);

          return (
            <Card key={sector.id} style={{ borderColor: sector.color || undefined }}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleSector(sector.id)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors" style={{ backgroundColor: `${sector.color || '#22c55e'}10` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: sector.color || '#22c55e' }} />
                        <CardTitle className="text-lg">{sector.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Receita</p>
                          <p className="font-bold text-green-600">{formatCurrency(financials.totalRevenue)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Despesas</p>
                          <p className="font-bold text-red-600">{formatCurrency(financials.totalExpenses)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Plantonistas</p>
                          <p className="font-bold text-blue-600">{formatCurrency(financials.plantonistaPayment)}</p>
                        </div>
                        <div className="text-right min-w-[120px]">
                          <p className="text-sm text-muted-foreground">Lucro</p>
                          <p className={`font-bold text-lg ${financials.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(financials.profit)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-4 space-y-6">
                    {/* Revenue Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          Receitas
                        </h4>
                        <Button variant="outline" size="sm" onClick={() => openRevenueDialog(sector)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                          <p className="text-sm text-muted-foreground">Receita Fixa</p>
                          <p className="text-lg font-bold text-green-600">{formatCurrency(financials.fixedRevenue)}</p>
                        </div>
                        <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                          <p className="text-sm text-muted-foreground">Receita Variável</p>
                          <p className="text-lg font-bold text-green-600">{formatCurrency(financials.variableRevenue)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Expenses Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-red-600" />
                          Despesas
                        </h4>
                        <Button variant="outline" size="sm" onClick={() => openExpenseDialog(sector)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar
                        </Button>
                      </div>
                      
                      {sectorExpenses.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sectorExpenses.map(expense => (
                              <TableRow key={expense.id}>
                                <TableCell>
                                  <Badge variant={expense.expense_type === 'tax' ? 'destructive' : expense.expense_type === 'general' ? 'secondary' : 'outline'}>
                                    {expense.expense_type === 'tax' ? 'Imposto' : expense.expense_type === 'general' ? 'Geral' : 'Específico'}
                                  </Badge>
                                </TableCell>
                                <TableCell>{expense.expense_name}</TableCell>
                                <TableCell className="text-right font-medium text-red-600">
                                  {formatCurrency(expense.amount)}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteExpense(expense.id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="font-bold">
                              <TableCell colSpan={2}>Total Despesas</TableCell>
                              <TableCell className="text-right text-red-600">{formatCurrency(financials.totalExpenses)}</TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground text-sm text-center py-4">Nenhuma despesa cadastrada</p>
                      )}
                    </div>

                    {/* Plantonista Payments */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-blue-600" />
                          <span className="font-medium">Pagamento de Plantonistas</span>
                        </div>
                        <span className="text-lg font-bold text-blue-600">{formatCurrency(financials.plantonistaPayment)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Calculado automaticamente com base nos plantões do mês</p>
                    </div>

                    {/* Profit Summary */}
                    <div className={`p-4 rounded-lg ${financials.profit >= 0 ? 'bg-green-100 dark:bg-green-950/30' : 'bg-red-100 dark:bg-red-950/30'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-lg">Resultado (Lucro)</span>
                          <p className="text-xs text-muted-foreground">Receitas - Despesas - Pagamentos</p>
                        </div>
                        <span className={`text-2xl font-bold ${financials.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(financials.profit)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {sectors.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum setor cadastrado. Cadastre setores para gerenciar a rentabilidade.
          </CardContent>
        </Card>
      )}

      {/* Revenue Edit Dialog */}
      <Dialog open={editRevenueDialogOpen} onOpenChange={setEditRevenueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Receitas - {editingSector?.name}
            </DialogTitle>
            <DialogDescription>
              Informe as receitas do setor para {monthName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fixed_revenue">Receita Fixa (R$)</Label>
              <Input
                id="fixed_revenue"
                type="number"
                step="0.01"
                placeholder="0,00"
                value={revenueForm.fixed_revenue}
                onChange={(e) => setRevenueForm(prev => ({ ...prev, fixed_revenue: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="variable_revenue">Receita Variável (R$)</Label>
              <Input
                id="variable_revenue"
                type="number"
                step="0.01"
                placeholder="0,00"
                value={revenueForm.variable_revenue}
                onChange={(e) => setRevenueForm(prev => ({ ...prev, variable_revenue: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revenue_notes">Observações (opcional)</Label>
              <Input
                id="revenue_notes"
                placeholder="Notas sobre as receitas..."
                value={revenueForm.notes}
                onChange={(e) => setRevenueForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditRevenueDialogOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSaveRevenue}>
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Expense Dialog */}
      <Dialog open={addExpenseDialogOpen} onOpenChange={setAddExpenseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-red-600" />
              Nova Despesa - {editingSector?.name}
            </DialogTitle>
            <DialogDescription>
              Adicione uma despesa para {monthName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de Despesa</Label>
              <Select 
                value={expenseForm.expense_type} 
                onValueChange={(v) => setExpenseForm(prev => ({ ...prev, expense_type: v as 'tax' | 'general' | 'specific' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tax">Imposto</SelectItem>
                  <SelectItem value="general">Gasto Geral</SelectItem>
                  <SelectItem value="specific">Gasto Específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense_name">Nome da Despesa</Label>
              <Input
                id="expense_name"
                placeholder="Ex: ISS, Aluguel, Material..."
                value={expenseForm.expense_name}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expense_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense_amount">Valor (R$)</Label>
              <Input
                id="expense_amount"
                type="number"
                step="0.01"
                placeholder="0,00"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense_notes">Observações (opcional)</Label>
              <Input
                id="expense_notes"
                placeholder="Notas sobre a despesa..."
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setAddExpenseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSaveExpense}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
