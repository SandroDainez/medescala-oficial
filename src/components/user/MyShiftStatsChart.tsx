import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { format, startOfYear, endOfYear, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

interface ShiftAssignmentData {
  shift_date: string;
  sector_id: string | null;
  sector_name: string | null;
  sector_color: string | null;
}

export function MyShiftStatsChart() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Fetch user's sector memberships
  const { data: mySectors } = useQuery({
    queryKey: ['my-sectors', currentTenantId, user?.id],
    queryFn: async () => {
      if (!currentTenantId || !user) return [];
      const { data, error } = await supabase
        .from('sector_memberships')
        .select('sector_id, sector:sectors(id, name, color)')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id);
      
      if (error) throw error;
      return data?.map(d => d.sector as Sector) || [];
    },
    enabled: !!currentTenantId && !!user,
  });

  // Fetch user's shift assignments for the selected year
  const { data: shiftData, isLoading } = useQuery({
    queryKey: ['my-shift-stats', currentTenantId, user?.id, selectedYear],
    queryFn: async () => {
      if (!currentTenantId || !user) return [];
      
      const startDate = format(startOfYear(new Date(selectedYear, 0, 1)), 'yyyy-MM-dd');
      const endDate = format(endOfYear(new Date(selectedYear, 0, 1)), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('shift_assignments')
        .select(`
          id,
          shift:shifts!inner(
            shift_date,
            sector_id,
            sector:sectors(id, name, color)
          )
        `)
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .gte('shift.shift_date', startDate)
        .lte('shift.shift_date', endDate);
      
      if (error) throw error;
      
      return data?.map(d => ({
        shift_date: (d.shift as any).shift_date,
        sector_id: (d.shift as any).sector_id,
        sector_name: (d.shift as any).sector?.name || null,
        sector_color: (d.shift as any).sector?.color || null,
      })) as ShiftAssignmentData[] || [];
    },
    enabled: !!currentTenantId && !!user,
    refetchInterval: 30000, // Refresh every 30 seconds for live updates
  });

  // Build chart data grouped by month and sector
  const chartData = useMemo(() => {
    if (!shiftData || !mySectors) return [];

    // Create months array
    const months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(selectedYear, i, 1);
      return {
        month: format(date, 'MMM', { locale: ptBR }),
        monthNum: i,
      };
    });

    // Get unique sectors from user's memberships
    const sectorMap = new Map<string, Sector>();
    mySectors.forEach(s => {
      if (s) sectorMap.set(s.id, s);
    });

    // Aggregate shifts by month and sector
    const aggregated = months.map(({ month, monthNum }) => {
      const row: Record<string, any> = { month };
      
      sectorMap.forEach((sector, sectorId) => {
        const count = shiftData.filter(d => {
          if (!d.shift_date || d.sector_id !== sectorId) return false;
          const shiftMonth = parseISO(d.shift_date).getMonth();
          return shiftMonth === monthNum;
        }).length;
        
        row[sector.name] = count;
      });
      
      return row;
    });

    return aggregated;
  }, [shiftData, mySectors, selectedYear]);

  // Predefined color palette - always use distinct colors for each sector
  const colorPalette = useMemo(() => [
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
    '#10b981', // emerald
    '#14b8a6', // teal
    '#a855f7', // purple
    '#f43f5e', // rose
    '#0ea5e9', // sky
    '#eab308', // yellow
  ], []);

  // Get sectors for the legend with distinct colors - always use palette for distinct visualization
  const sectorsForChart = useMemo(() => {
    if (!mySectors) return [];
    return mySectors
      .filter(s => s !== null)
      .map((s, index) => ({
        ...s,
        // Always use palette color based on index for distinct visualization
        color: colorPalette[index % colorPalette.length],
      })) as Sector[];
  }, [mySectors, colorPalette]);

  // Generate year options (current year and 2 previous years)
  const yearOptions = useMemo(() => {
    return [currentYear, currentYear - 1, currentYear - 2];
  }, [currentYear]);

  // Check if there's any data to show
  const hasData = useMemo(() => {
    return chartData.some(row => {
      return Object.keys(row).some(key => key !== 'month' && row[key] > 0);
    });
  }, [chartData]);

  if (!currentTenantId || !user) {
    return null;
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Meus Plantões por Setor
          </CardTitle>
          <Select
            value={selectedYear.toString()}
            onValueChange={(value) => setSelectedYear(Number(value))}
          >
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(year => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[200px] w-full" />
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <BarChart3 className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm">Nenhum plantão encontrado em {selectedYear}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="month" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '12px' }}
                iconType="square"
              />
              {sectorsForChart.map((sector) => (
                <Bar 
                  key={sector.id}
                  dataKey={sector.name}
                  stackId="a"
                  fill={sector.color}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
