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
} from 'recharts';
import { Building, DollarSign, Users } from 'lucide-react';

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

interface Shift {
  id: string;
  shift_date: string;
  sector_id: string | null;
  base_value?: number | null;
}

interface ShiftAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_value: number | null;
}

interface SectorMembership {
  sector_id: string;
  user_id: string;
}

interface DashboardChartsProps {
  shifts: Shift[];
  assignments: ShiftAssignment[];
  sectors: Sector[];
  members: { id: string; name: string | null; full_name?: string | null }[];
  sectorMemberships: SectorMembership[];
  currentMonth: Date;
}

type UserMetric = {
  user_id: string;
  name: string;
  plantoes: number;
  valor: number;
};

type SectorMetric = {
  sectorId: string;
  sectorName: string;
  sectorColor: string;
  userData: UserMetric[];
  totalPlantoes: number;
  totalValor: number;
};

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shiftValueToReceive(assignedValue: number | null, shiftBaseValue: number | null | undefined) {
  if (assignedValue !== null && assignedValue !== undefined) return Number(assignedValue);
  return Number(shiftBaseValue ?? 0);
}

export function DashboardCharts({
  shifts,
  assignments,
  sectors,
  members,
  sectorMemberships,
}: DashboardChartsProps) {
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      const name = m.full_name?.trim() || m.name?.trim() || 'Sem nome';
      map.set(m.id, name);
    }
    return map;
  }, [members]);

  const shiftById = useMemo(() => {
    const map = new Map<string, Shift>();
    for (const shift of shifts) map.set(shift.id, shift);
    return map;
  }, [shifts]);

  const allowedUsersBySector = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of sectorMemberships) {
      if (!map.has(row.sector_id)) map.set(row.sector_id, new Set<string>());
      map.get(row.sector_id)!.add(row.user_id);
    }
    return map;
  }, [sectorMemberships]);

  const sectorMetrics = useMemo<SectorMetric[]>(() => {
    return sectors
      .map((sector) => {
        const userMap = new Map<string, UserMetric>();
        const allowedUsers = allowedUsersBySector.get(sector.id);

        for (const assignment of assignments) {
          const shift = shiftById.get(assignment.shift_id);
          if (!shift || shift.sector_id !== sector.id) continue;

          // Garante gráficos exclusivos de participantes do setor
          if (allowedUsers && !allowedUsers.has(assignment.user_id)) continue;

          const key = assignment.user_id;
          const existing = userMap.get(key) ?? {
            user_id: key,
            name: memberNameById.get(key) ?? 'Sem nome',
            plantoes: 0,
            valor: 0,
          };

          existing.plantoes += 1;
          existing.valor += shiftValueToReceive(assignment.assigned_value, shift.base_value);
          userMap.set(key, existing);
        }

        const userData = Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        const totalPlantoes = userData.reduce((sum, u) => sum + u.plantoes, 0);
        const totalValor = userData.reduce((sum, u) => sum + u.valor, 0);

        return {
          sectorId: sector.id,
          sectorName: sector.name,
          sectorColor: sector.color || '#22c55e',
          userData,
          totalPlantoes,
          totalValor,
        };
      })
      .filter((sector) => sector.userData.length > 0);
  }, [sectors, allowedUsersBySector, assignments, shiftById, memberNameById]);

  const generalByUser = useMemo<UserMetric[]>(() => {
    const userMap = new Map<string, UserMetric>();
    for (const sector of sectorMetrics) {
      for (const user of sector.userData) {
        const existing = userMap.get(user.user_id) ?? {
          user_id: user.user_id,
          name: user.name,
          plantoes: 0,
          valor: 0,
        };
        existing.plantoes += user.plantoes;
        existing.valor += user.valor;
        userMap.set(user.user_id, existing);
      }
    }
    return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [sectorMetrics]);

  const totals = useMemo(() => {
    return {
      plantoes: generalByUser.reduce((sum, user) => sum + user.plantoes, 0),
      valor: generalByUser.reduce((sum, user) => sum + user.valor, 0),
    };
  }, [generalByUser]);

  if (shifts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhum dado disponível para exibir gráficos</p>
      </div>
    );
  }

  const currencyTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm text-success">A receber: R$ {formatCurrency(payload[0].value || 0)}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Geral - Todos os Setores
          </CardTitle>
          <CardDescription>
            Total de plantões e valor a receber por plantonista (soma dos setores)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Plantões</p>
              <p className="text-xl font-semibold">{totals.plantoes}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Valor a receber</p>
              <p className="text-xl font-semibold text-success">R$ {formatCurrency(totals.valor)}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium mb-2">Plantões por Plantonista</p>
              <ResponsiveContainer width="100%" height={Math.max(260, generalByUser.length * 32)}>
                <BarChart data={generalByUser} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="plantoes" fill="hsl(45, 100%, 51%)" name="Plantões" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Valor a Receber por Plantonista</p>
              <ResponsiveContainer width="100%" height={Math.max(260, generalByUser.length * 32)}>
                <BarChart data={generalByUser} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip content={currencyTooltip} />
                  <Bar dataKey="valor" fill="hsl(142, 76%, 36%)" name="A receber (R$)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {sectorMetrics.map((sector) => (
          <Card key={sector.sectorId} className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="h-4 w-4" style={{ color: sector.sectorColor }} />
                {sector.sectorName}
              </CardTitle>
              <CardDescription>
                Participantes do setor: {sector.userData.length} • Plantões: {sector.totalPlantoes} • A receber: R$ {formatCurrency(sector.totalValor)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Plantões no setor</p>
                <ResponsiveContainer width="100%" height={Math.max(220, sector.userData.length * 32)}>
                  <BarChart data={sector.userData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="plantoes" fill={sector.sectorColor} name="Plantões" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Valor a receber no setor</p>
                <ResponsiveContainer width="100%" height={Math.max(220, sector.userData.length * 32)}>
                  <BarChart data={sector.userData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <Tooltip content={currencyTooltip} />
                    <Bar dataKey="valor" fill="hsl(142, 76%, 36%)" name="A receber (R$)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
