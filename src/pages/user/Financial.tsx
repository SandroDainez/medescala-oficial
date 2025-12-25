import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { DollarSign, Calendar, Clock } from 'lucide-react';

interface FinancialSummary { totalShifts: number; totalHours: number; totalValue: number; status: string | null; }
interface CompletedShift { id: string; assigned_value: number; checkin_at: string | null; checkout_at: string | null; shift: { title: string; hospital: string; shift_date: string }; }

export default function UserFinancial() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [summary, setSummary] = useState<FinancialSummary>({ totalShifts: 0, totalHours: 0, totalValue: 0, status: null });
  const [shifts, setShifts] = useState<CompletedShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const months = [{ value: 1, label: 'Janeiro' },{ value: 2, label: 'Fevereiro' },{ value: 3, label: 'Março' },{ value: 4, label: 'Abril' },{ value: 5, label: 'Maio' },{ value: 6, label: 'Junho' },{ value: 7, label: 'Julho' },{ value: 8, label: 'Agosto' },{ value: 9, label: 'Setembro' },{ value: 10, label: 'Outubro' },{ value: 11, label: 'Novembro' },{ value: 12, label: 'Dezembro' }];
  const years = [2024, 2025, 2026];

  useEffect(() => { if (user && currentTenantId) fetchData(); }, [user, currentTenantId, selectedMonth, selectedYear]);

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];
    const { data: assignments } = await supabase.from('shift_assignments').select('id, assigned_value, checkin_at, checkout_at, shift:shifts!inner(title, hospital, shift_date, base_value)').eq('tenant_id', currentTenantId).eq('user_id', user?.id).in('status', ['assigned', 'completed']).gte('shift.shift_date', startDate).lte('shift.shift_date', endDate);
    const { data: payment } = await supabase.from('payments').select('status').eq('tenant_id', currentTenantId).eq('user_id', user?.id).eq('month', selectedMonth).eq('year', selectedYear).maybeSingle();
    if (assignments) {
      // Map assignments to use base_value as fallback when assigned_value is 0
      const mappedAssignments = assignments.map((a: any) => ({
        ...a,
        assigned_value: Number(a.assigned_value) > 0 ? Number(a.assigned_value) : Number(a.shift?.base_value) || 0
      }));
      console.log('[UserFinancial] sample values', mappedAssignments.slice(0, 5).map((a: any) => ({ date: a.shift?.shift_date, title: a.shift?.title, assigned_value: a.assigned_value, base_value: a.shift?.base_value })));
      setShifts(mappedAssignments as unknown as CompletedShift[]);
      let totalHours = 0;
      mappedAssignments.forEach((a: any) => { if (a.checkin_at && a.checkout_at) totalHours += (new Date(a.checkout_at).getTime() - new Date(a.checkin_at).getTime()) / 3600000; });
      setSummary({ totalShifts: mappedAssignments.length, totalHours, totalValue: mappedAssignments.reduce((s: number, a: any) => s + Number(a.assigned_value || 0), 0), status: payment?.status || null });
    }

    setLoading(false);
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold text-foreground">Financeiro</h2><p className="text-muted-foreground">Seu resumo mensal</p></div><div className="flex gap-2"><Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>)}</SelectContent></Select><Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Plantões</CardTitle><Calendar className="h-5 w-5 text-primary" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.totalShifts}</div></CardContent></Card><Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Horas</CardTitle><Clock className="h-5 w-5 text-primary" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary.totalHours.toFixed(1)}h</div></CardContent></Card><Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle><DollarSign className="h-5 w-5 text-primary" /></CardHeader><CardContent><div className="flex items-center gap-2"><span className="text-2xl font-bold">R$ {summary.totalValue.toFixed(2)}</span>{summary.status && <Badge variant="outline">{summary.status === 'closed' ? 'Fechado' : summary.status === 'paid' ? 'Pago' : 'Aberto'}</Badge>}</div></CardContent></Card></div>
      <Card><CardHeader><CardTitle>Plantões Concluídos</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Plantão</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader><TableBody>{shifts.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhum plantão</TableCell></TableRow> : shifts.map(s => <TableRow key={s.id}><TableCell>{new Date(s.shift.shift_date).toLocaleDateString('pt-BR')}</TableCell><TableCell>{s.shift.title}</TableCell><TableCell className="text-right font-medium">R$ {Number(s.assigned_value).toFixed(2)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  );
}
