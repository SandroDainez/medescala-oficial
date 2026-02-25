import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { format, parseISO, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type Row = {
  month: string;
  plantoes: number;
  horas: number;
};

export function MyGlobalShiftStatsChart() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const { data, isLoading } = useQuery({
    queryKey: ['my-global-stats', currentTenantId, user?.id, selectedYear],
    queryFn: async () => {
      if (!currentTenantId || !user?.id) return [] as Row[];

      const startDate = format(startOfYear(new Date(selectedYear, 0, 1)), 'yyyy-MM-dd');
      const endDate = format(endOfYear(new Date(selectedYear, 0, 1)), 'yyyy-MM-dd');

      const { data: rows, error } = await supabase
        .from('shift_assignments')
        .select('shift:shifts!inner(shift_date, start_time, end_time)')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .in('status', ['assigned', 'confirmed', 'completed'])
        .gte('shift.shift_date', startDate)
        .lte('shift.shift_date', endDate);

      if (error) throw error;

      const monthAgg = Array.from({ length: 12 }, (_, monthIndex) => ({
        month: format(new Date(selectedYear, monthIndex, 1), 'MMM', { locale: ptBR }),
        plantoes: 0,
        horas: 0,
      }));

      (rows ?? []).forEach((r: any) => {
        const shift = r.shift;
        if (!shift?.shift_date || !shift?.start_time || !shift?.end_time) return;
        const m = parseISO(shift.shift_date).getMonth();
        monthAgg[m].plantoes += 1;

        const [sh] = shift.start_time.split(':').map(Number);
        const [eh] = shift.end_time.split(':').map(Number);
        let h = eh - sh;
        if (h < 0) h += 24;
        monthAgg[m].horas += h;
      });

      return monthAgg;
    },
    enabled: !!currentTenantId && !!user?.id,
    refetchInterval: 30000,
  });

  const hasData = useMemo(() => (data ?? []).some((r) => r.plantoes > 0), [data]);
  const years = useMemo(() => [currentYear, currentYear - 1, currentYear - 2], [currentYear]);

  if (!currentTenantId || !user?.id) return null;

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Evolução Global
          </CardTitle>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : !hasData ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum plantão encontrado em {selectedYear}.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="plantoes" name="Plantões" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="horas" name="Horas" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

