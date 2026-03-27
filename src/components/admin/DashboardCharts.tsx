import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  profile?: { name: string | null } | null;
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

function truncateName(name: string, maxLength: number) {
  if (!name) return 'Sem nome';
  if (name.length <= maxLength) return name;
  return `${name.slice(0, Math.max(0, maxLength - 1))}…`;
}

function shiftValueToReceive(assignedValue: number | null, _shiftBaseValue: number | null | undefined) {
  // Dashboard now receives normalized values from the unified financial mapper.
  // Avoid fallback to shift base value here to prevent double counting/divergence.
  if (assignedValue !== null && assignedValue !== undefined) return Number(assignedValue);
  return 0;
}

export function DashboardCharts({
  shifts,
  assignments,
  sectors,
  members,
  sectorMemberships,
}: DashboardChartsProps) {
  const [selectedChartKey, setSelectedChartKey] = useState<string>('geral:plantoes');
  const allowedChartUserIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      const name = m.full_name?.trim() || m.name?.trim() || 'Sem nome';
      map.set(m.id, name);
    }
    return map;
  }, [members]);

  const assignmentNameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const assignment of assignments) {
      if (!allowedChartUserIds.has(assignment.user_id)) continue;
      const name = assignment.profile?.name?.trim();
      if (!name) continue;
      if (!map.has(assignment.user_id)) {
        map.set(assignment.user_id, name);
      }
    }
    return map;
  }, [assignments, allowedChartUserIds]);

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
          if (!allowedChartUserIds.has(assignment.user_id)) continue;
          const shift = shiftById.get(assignment.shift_id);
          if (!shift || shift.sector_id !== sector.id) continue;

          // Garante gráficos exclusivos de participantes do setor
          if (allowedUsers && !allowedUsers.has(assignment.user_id)) continue;

          const key = assignment.user_id;
          const existing = userMap.get(key) ?? {
            user_id: key,
            name: assignmentNameByUserId.get(key) ?? memberNameById.get(key) ?? 'Sem nome',
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
  }, [sectors, allowedUsersBySector, assignments, shiftById, memberNameById, assignmentNameByUserId, allowedChartUserIds]);

  const generalByUser = useMemo<UserMetric[]>(() => {
    const userMap = new Map<string, UserMetric>();

    for (const assignment of assignments) {
      if (!allowedChartUserIds.has(assignment.user_id)) continue;

      const shift = shiftById.get(assignment.shift_id);
      if (!shift) continue;

      const existing = userMap.get(assignment.user_id) ?? {
        user_id: assignment.user_id,
        name: assignmentNameByUserId.get(assignment.user_id) ?? memberNameById.get(assignment.user_id) ?? 'Sem nome',
        plantoes: 0,
        valor: 0,
      };

      existing.plantoes += 1;
      existing.valor += shiftValueToReceive(assignment.assigned_value, shift.base_value);
      userMap.set(assignment.user_id, existing);
    }

    return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [assignments, shiftById, allowedChartUserIds, assignmentNameByUserId, memberNameById]);

  const totals = useMemo(() => {
    return {
      plantoes: generalByUser.reduce((sum, user) => sum + user.plantoes, 0),
      valor: generalByUser.reduce((sum, user) => sum + user.valor, 0),
    };
  }, [generalByUser]);

  const chartOptions = useMemo(() => {
    const options: Array<{ key: string; label: string }> = [
      { key: 'geral:plantoes', label: 'Geral - Plantões por Plantonista' },
      { key: 'geral:valor', label: 'Geral - Valor por Plantonista' },
    ];
    for (const sector of sectorMetrics) {
      options.push({ key: `setor:${sector.sectorId}:plantoes`, label: `${sector.sectorName} - Plantões` });
      options.push({ key: `setor:${sector.sectorId}:valor`, label: `${sector.sectorName} - Valor` });
    }
    return options;
  }, [sectorMetrics]);

  useEffect(() => {
    if (!chartOptions.some((option) => option.key === selectedChartKey)) {
      setSelectedChartKey('geral:plantoes');
    }
  }, [chartOptions, selectedChartKey]);

  const selectedChart = useMemo(() => {
    if (selectedChartKey.startsWith('setor:')) {
      const [, sectorId, metric] = selectedChartKey.split(':');
      const sector = sectorMetrics.find((item) => item.sectorId === sectorId);
      if (sector) {
        return {
          title: metric === 'valor' ? `Valor a receber no setor` : `Plantões no setor`,
          description: `${sector.sectorName} · ${sector.userData.length} participantes`,
          data: sector.userData,
          dataKey: metric === 'valor' ? 'valor' : 'plantoes',
          barColor: metric === 'valor' ? 'hsl(142, 76%, 36%)' : sector.sectorColor,
          useCurrencyTooltip: metric === 'valor',
          yWidth: 180,
        } as const;
      }
    }

    return {
      title: selectedChartKey === 'geral:valor' ? 'Valor a Receber por Plantonista' : 'Plantões por Plantonista',
      description: 'Soma de todos os setores',
      data: generalByUser,
      dataKey: selectedChartKey === 'geral:valor' ? 'valor' : 'plantoes',
      barColor: selectedChartKey === 'geral:valor' ? 'hsl(142, 76%, 36%)' : 'hsl(45, 100%, 51%)',
      useCurrencyTooltip: selectedChartKey === 'geral:valor',
      yWidth: 220,
    } as const;
  }, [selectedChartKey, sectorMetrics, generalByUser]);

  const hasChartData = selectedChart.data.length > 0;

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

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Selecionar gráfico</CardTitle>
              <CardDescription>Mostra apenas o gráfico escolhido</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedChartKey} onValueChange={setSelectedChartKey}>
                <SelectTrigger className="w-full md:w-[420px]">
                  <SelectValue placeholder="Selecione o gráfico" />
                </SelectTrigger>
                <SelectContent>
                  {chartOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div>
                <p className="text-sm font-medium mb-1">{selectedChart.title}</p>
                <p className="text-xs text-muted-foreground mb-2">{selectedChart.description}</p>
                {hasChartData ? (
                  <ResponsiveContainer width="100%" height={Math.max(260, selectedChart.data.length * 32)}>
                    <BarChart data={selectedChart.data} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={selectedChart.yWidth}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickFormatter={(value: string) => truncateName(value, selectedChart.yWidth > 200 ? 28 : 20)}
                      />
                      <Tooltip content={selectedChart.useCurrencyTooltip ? currencyTooltip : undefined} />
                      <Bar
                        dataKey={selectedChart.dataKey}
                        fill={selectedChart.barColor}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex min-h-[260px] flex-col items-center justify-center rounded-md border border-dashed border-border text-center text-muted-foreground">
                    <Building className="mb-3 h-10 w-10 opacity-50" />
                    <p className="font-medium">Sem dados para este gráfico ainda</p>
                    <p className="mt-1 max-w-md text-sm">
                      Os gráficos aparecem conforme o hospital recebe plantões atribuídos no mês selecionado.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
