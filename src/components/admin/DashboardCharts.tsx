import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
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
  // Sectors to exclude from charts (case-insensitive partial match)
  const excludedSectorPatterns = [
    'pré anest',
    'pre anest',
    'horario extendido',
    'horário extendido',
    'estagio uti',
    'estágio uti'
  ];

  // Filter out excluded sectors
  const filteredSectors = useMemo(() => {
    return sectors.filter(sector => {
      const sectorNameLower = sector.name.toLowerCase();
      return !excludedSectorPatterns.some(pattern => 
        sectorNameLower.includes(pattern.toLowerCase())
      );
    });
  }, [sectors]);

  // Plantonistas by sector (grouped bar chart data)
  const plantonistasBySector = useMemo(() => {
    const sectorData: Record<string, { sectorName: string; sectorColor: string; users: Record<string, number> }> = {};

    assignments.forEach(assignment => {
      const shift = shifts.find(s => s.id === assignment.shift_id);
      if (shift && shift.sector_id) {
        const sector = filteredSectors.find(s => s.id === shift.sector_id);
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
          fullName: member?.name || 'N/A',
          plantoes: count,
        };
      }).sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'))
    })).filter(s => s.userData.length > 0);
  }, [assignments, shifts, filteredSectors, members]);

  // Top plantonistas - sorted by shift count (keep this sort for ranking)
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

  // Values by sector with plantonista breakdown
  const valuesBySectorWithPlantonistas = useMemo(() => {
    const sectorData: Record<string, { 
      sectorName: string; 
      sectorColor: string; 
      users: Record<string, { name: string; value: number }> 
    }> = {};

    assignments.forEach(assignment => {
      const shift = shifts.find(s => s.id === assignment.shift_id);
      if (shift && shift.sector_id) {
        const sector = filteredSectors.find(s => s.id === shift.sector_id);
        if (sector) {
          if (!sectorData[sector.id]) {
            sectorData[sector.id] = {
              sectorName: sector.name,
              sectorColor: sector.color || '#22c55e',
              users: {}
            };
          }
          const member = members.find(m => m.id === assignment.user_id);
          const memberName = member?.name?.split(' ')[0] || 'N/A';
          if (!sectorData[sector.id].users[assignment.user_id]) {
            sectorData[sector.id].users[assignment.user_id] = {
              name: memberName,
              value: 0
            };
          }
          sectorData[sector.id].users[assignment.user_id].value += (assignment.assigned_value || 0);
        }
      }
    });

    return Object.values(sectorData).map(sector => ({
      ...sector,
      userData: Object.values(sector.users)
        .filter(u => u.value > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      totalValue: Object.values(sector.users).reduce((sum, u) => sum + u.value, 0)
    })).filter(s => s.totalValue > 0);
  }, [assignments, shifts, filteredSectors, members]);

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

        {/* Values Paid by Sector with Plantonista Breakdown */}
        {valuesBySectorWithPlantonistas.length > 0 && (
          <Card className="card-elevated md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-success" />
                Valores Pagos por Setor
              </CardTitle>
              <CardDescription>Detalhamento por plantonista</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {valuesBySectorWithPlantonistas.map((sector, idx) => (
                <div key={idx} className="border-b border-border pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: sector.sectorColor }}
                      />
                      <span className="font-medium text-sm">{sector.sectorName}</span>
                    </div>
                    <span className="text-sm font-semibold text-success">
                      R$ {sector.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="grid gap-1 pl-5">
                    {sector.userData.map((user, uIdx) => (
                      <div key={uIdx} className="flex justify-between text-xs text-muted-foreground">
                        <span>{user.name}</span>
                        <span>R$ {user.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
