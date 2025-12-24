import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Download, Lock } from 'lucide-react';

interface PaymentSummary {
  user_id: string;
  user_name: string | null;
  total_shifts: number;
  total_value: number;
  payment_status: string | null;
  payment_id: string | null;
}

export default function AdminFinancial() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [summaries, setSummaries] = useState<PaymentSummary[]>([]);
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
    { value: 12, label: 'Dezembro' },
  ];

  const years = [2024, 2025, 2026];

  useEffect(() => {
    fetchSummaries();
  }, [selectedMonth, selectedYear]);

  async function fetchSummaries() {
    setLoading(true);
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

    // Fetch assignments for the month
    const { data: assignments } = await supabase
      .from('shift_assignments')
      .select(`
        user_id,
        assigned_value,
        shift:shifts!inner(shift_date)
      `)
      .gte('shift.shift_date', startDate)
      .lte('shift.shift_date', endDate)
      .eq('status', 'completed');

    // Fetch profiles
    const { data: profiles } = await supabase.from('profiles').select('id, name');

    // Fetch existing payments for the month
    const { data: payments } = await supabase
      .from('payments')
      .select('id, user_id, status')
      .eq('month', selectedMonth)
      .eq('year', selectedYear);

    // Group by user
    const userSummaries: Record<string, PaymentSummary> = {};

    profiles?.forEach((p) => {
      userSummaries[p.id] = {
        user_id: p.id,
        user_name: p.name,
        total_shifts: 0,
        total_value: 0,
        payment_status: null,
        payment_id: null,
      };
    });

    assignments?.forEach((a) => {
      if (userSummaries[a.user_id]) {
        userSummaries[a.user_id].total_shifts += 1;
        userSummaries[a.user_id].total_value += Number(a.assigned_value) || 0;
      }
    });

    payments?.forEach((p) => {
      if (userSummaries[p.user_id]) {
        userSummaries[p.user_id].payment_status = p.status;
        userSummaries[p.user_id].payment_id = p.id;
      }
    });

    setSummaries(Object.values(userSummaries).filter((s) => s.total_shifts > 0 || s.payment_status));
    setLoading(false);
  }

  async function closeMonth(userId: string, totalShifts: number, totalValue: number) {
    const { error } = await supabase.from('payments').upsert({
      user_id: userId,
      month: selectedMonth,
      year: selectedYear,
      total_shifts: totalShifts,
      total_value: totalValue,
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: user?.id,
    }, { onConflict: 'user_id,month,year' });

    if (error) {
      toast({ title: 'Erro ao fechar mês', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Mês fechado para o usuário!' });
      fetchSummaries();
    }
  }

  function exportCSV() {
    const headers = ['Nome', 'Plantões', 'Valor Total', 'Status'];
    const rows = summaries.map((s) => [
      s.user_name || 'N/A',
      s.total_shifts.toString(),
      s.total_value.toFixed(2),
      s.payment_status || 'aberto',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-${selectedMonth}-${selectedYear}.csv`;
    a.click();
  }

  const statusColors = {
    open: 'bg-yellow-500/10 text-yellow-600',
    closed: 'bg-blue-500/10 text-blue-600',
    paid: 'bg-green-500/10 text-green-600',
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Financeiro</h2>
          <p className="text-muted-foreground">Resumo financeiro mensal</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value.toString()}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Plantões</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum dado para o período selecionado
                  </TableCell>
                </TableRow>
              ) : (
                summaries.map((summary) => (
                  <TableRow key={summary.user_id}>
                    <TableCell className="font-medium">{summary.user_name || 'N/A'}</TableCell>
                    <TableCell>{summary.total_shifts}</TableCell>
                    <TableCell>R$ {summary.total_value.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        className={statusColors[summary.payment_status as keyof typeof statusColors] || statusColors.open}
                        variant="outline"
                      >
                        {summary.payment_status === 'closed' ? 'Fechado' : summary.payment_status === 'paid' ? 'Pago' : 'Aberto'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {(!summary.payment_status || summary.payment_status === 'open') && summary.total_shifts > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => closeMonth(summary.user_id, summary.total_shifts, summary.total_value)}
                        >
                          <Lock className="mr-2 h-4 w-4" />
                          Fechar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
