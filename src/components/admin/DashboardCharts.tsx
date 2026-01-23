import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
  Legend
} from 'recharts';
import { TrendingUp, Users, Calendar, DollarSign } from 'lucide-react';

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

interface Shift {
  id: string;
  shift_date: string;
  sector_id: string | null;
}

interface ShiftAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_value: number | null;
}

interface DashboardChartsProps {
  shifts: Shift[];
  assignments: ShiftAssignment[];
  sectors: Sector[];
  members: { id: string; name: string | null }[];
  currentMonth: Date;
}

export function DashboardCharts({ 
  shifts, 
  assignments, 
  sectors, 
  members,
  currentMonth 
}: DashboardChartsProps) {
  // Shifts by sector
  const shiftsBySector = useMemo(() => {
    const sectorCounts: Record<string, number> = {};
    
    shifts.forEach(shift => {
      const sectorId = shift.sector_id || 'sem-setor';
      sectorCounts[sectorId] = (sectorCounts[sectorId] || 0) + 1;
    });

    return sectors.map(sector => ({
      name: sector.name,
      value: sectorCounts[sector.id] || 0,
      color: sector.color || '#22c55e',
    })).filter(s => s.value > 0);
  }, [shifts, sectors]);

  // Shifts by day of week
  const shiftsByDayOfWeek = useMemo(() => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const dayCounts = new Array(7).fill(0);

    shifts.forEach(shift => {
      const dayOfWeek = new Date(shift.shift_date + 'T00:00:00').getDay();
      dayCounts[dayOfWeek]++;
    });

    return days.map((day, index) => ({
      name: day,
      plantoes: dayCounts[index],
    }));
  }, [shifts]);

  // Value by sector
  const valueBySector = useMemo(() => {
    const sectorValues: Record<string, number> = {};

    assignments.forEach(assignment => {
      const shift = shifts.find(s => s.id === assignment.shift_id);
      if (shift && shift.sector_id) {
        sectorValues[shift.sector_id] = (sectorValues[shift.sector_id] || 0) + (assignment.assigned_value || 0);
      }
    });

    return sectors.map(sector => ({
      name: sector.name,
      valor: sectorValues[sector.id] || 0,
      color: sector.color || '#22c55e',
    })).filter(s => s.valor > 0);
  }, [assignments, shifts, sectors]);

  // Top plantonistas
  const topPlantonistas = useMemo(() => {
    const userShifts: Record<string, number> = {};

    assignments.forEach(assignment => {
      userShifts[assignment.user_id] = (userShifts[assignment.user_id] || 0) + 1;
    });

    return Object.entries(userShifts)
      .map(([userId, count]) => {
        const member = members.find(m => m.id === userId);
        return {
          name: member?.name?.split(' ')[0] || 'N/A',
          plantoes: count,
        };
      })
      .sort((a, b) => b.plantoes - a.plantoes)
      .slice(0, 5);
  }, [assignments, members]);

  // Occupancy rate by week
  const occupancyByWeek = useMemo(() => {
    const weeks: Record<number, { total: number; filled: number }> = {};
    
    shifts.forEach(shift => {
      const date = new Date(shift.shift_date + 'T00:00:00');
      const weekNum = Math.ceil((date.getDate()) / 7);
      
      if (!weeks[weekNum]) {
        weeks[weekNum] = { total: 0, filled: 0 };
      }
      weeks[weekNum].total++;
      
      const hasAssignment = assignments.some(a => a.shift_id === shift.id);
      if (hasAssignment) {
        weeks[weekNum].filled++;
      }
    });

    return Object.entries(weeks).map(([week, data]) => ({
      name: `Sem ${week}`,
      ocupacao: data.total > 0 ? Math.round((data.filled / data.total) * 100) : 0,
    }));
  }, [shifts, assignments]);

  const COLORS = ['hsl(160, 84%, 39%)', 'hsl(200, 100%, 50%)', 'hsl(45, 100%, 51%)', 'hsl(280, 70%, 50%)', 'hsl(0, 84%, 60%)'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.dataKey === 'valor' 
                ? `R$ ${entry.value.toLocaleString('pt-BR')}` 
                : entry.dataKey === 'ocupacao'
                ? `${entry.value}%`
                : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (shifts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhum dado disponível para exibir gráficos</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 animate-fade-in">
      {/* Shifts by Sector - Pie Chart */}
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Plantões por Setor
          </CardTitle>
          <CardDescription>Distribuição no mês</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={shiftsBySector}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {shiftsBySector.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                formatter={(value, entry: any) => (
                  <span className="text-sm text-muted-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Shifts by Day of Week - Bar Chart */}
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Plantões por Dia da Semana
          </CardTitle>
          <CardDescription>Volume de plantões</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={shiftsByDayOfWeek}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="name" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="plantoes" 
                fill="hsl(160, 84%, 39%)" 
                radius={[4, 4, 0, 0]}
                name="Plantões"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Occupancy Rate - Area Chart */}
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-info" />
            Taxa de Ocupação
          </CardTitle>
          <CardDescription>% de plantões preenchidos por semana</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={occupancyByWeek}>
              <defs>
                <linearGradient id="colorOcupacao" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(200, 100%, 50%)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(200, 100%, 50%)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="name" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="ocupacao" 
                stroke="hsl(200, 100%, 50%)" 
                fillOpacity={1} 
                fill="url(#colorOcupacao)"
                name="Ocupação"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Plantonistas - Bar Chart */}
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-warning" />
            Top Plantonistas
          </CardTitle>
          <CardDescription>Mais plantões no mês</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topPlantonistas} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                type="number"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="plantoes" 
                fill="hsl(45, 100%, 51%)" 
                radius={[0, 4, 4, 0]}
                name="Plantões"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Value by Sector - Bar Chart (Full Width) */}
      {valueBySector.length > 0 && (
        <Card className="card-elevated md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-success" />
              Valor Total por Setor
            </CardTitle>
            <CardDescription>Soma dos valores atribuídos no mês</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={valueBySector}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(value) => `R$${(value/1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="valor" 
                  radius={[4, 4, 0, 0]}
                  name="Valor"
                >
                  {valueBySector.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
