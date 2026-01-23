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
  Cell
} from 'recharts';
import { Users, DollarSign, Building } from 'lucide-react';

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
  // Plantonistas by sector (grouped bar chart data)
  const plantonistasBySector = useMemo(() => {
    const sectorData: Record<string, { sectorName: string; sectorColor: string; users: Record<string, number> }> = {};

    assignments.forEach(assignment => {
      const shift = shifts.find(s => s.id === assignment.shift_id);
      if (shift && shift.sector_id) {
        const sector = sectors.find(s => s.id === shift.sector_id);
        if (sector) {
          if (!sectorData[sector.id]) {
            sectorData[sector.id] = {
              sectorName: sector.name,
              sectorColor: sector.color || '#22c55e',
              users: {}
            };
          }
          sectorData[sector.id].users[assignment.user_id] = 
            (sectorData[sector.id].users[assignment.user_id] || 0) + 1;
        }
      }
    });

    // Transform into array format for each sector
    return Object.values(sectorData).map(sector => ({
      ...sector,
      userData: Object.entries(sector.users).map(([userId, count]) => {
        const member = members.find(m => m.id === userId);
        return {
          name: member?.name?.split(' ')[0] || 'N/A',
          plantoes: count,
        };
      }).sort((a, b) => b.plantoes - a.plantoes)
    })).filter(s => s.userData.length > 0);
  }, [assignments, shifts, sectors, members]);

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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.dataKey === 'valor' 
                ? `R$ ${entry.value.toLocaleString('pt-BR')}` 
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
        <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhum dado disponível para exibir gráficos</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 animate-fade-in">
      {/* Plantonistas by Sector - Multiple Bar Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {plantonistasBySector.map((sector, sectorIndex) => (
          <Card key={sectorIndex} className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="h-4 w-4" style={{ color: sector.sectorColor }} />
                {sector.sectorName}
              </CardTitle>
              <CardDescription>Plantões por plantonista</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(150, sector.userData.length * 35)}>
                <BarChart data={sector.userData} layout="vertical">
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
                    fill={sector.sectorColor}
                    radius={[0, 4, 4, 0]}
                    name="Plantões"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom row: Top Plantonistas + Values by Sector */}
      <div className="grid gap-6 md:grid-cols-2">
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

        {/* Value by Sector - Bar Chart */}
        {valueBySector.length > 0 && (
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-success" />
                Valores Pagos por Setor
              </CardTitle>
              <CardDescription>Total pago no mês</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={valueBySector}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    angle={-15}
                    textAnchor="end"
                    height={60}
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
    </div>
  );
}
