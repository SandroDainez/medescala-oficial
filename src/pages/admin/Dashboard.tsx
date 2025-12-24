import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Calendar, Users, ArrowLeftRight, DollarSign } from 'lucide-react';

interface DashboardStats {
  totalShifts: number;
  totalUsers: number;
  pendingSwaps: number;
  monthlyValue: number;
}

export default function AdminDashboard() {
  const { currentTenantId } = useTenant();
  const [stats, setStats] = useState<DashboardStats>({
    totalShifts: 0,
    totalUsers: 0,
    pendingSwaps: 0,
    monthlyValue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentTenantId) {
      fetchStats();
    }
  }, [currentTenantId]);

  async function fetchStats() {
    if (!currentTenantId) return;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [shiftsRes, membersRes, swapsRes, paymentsRes] = await Promise.all([
      supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId),
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).eq('active', true),
      supabase.from('swap_requests').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).eq('status', 'pending'),
      supabase
        .from('shift_assignments')
        .select('assigned_value')
        .eq('tenant_id', currentTenantId)
        .gte('created_at', `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`),
    ]);

    const monthlyValue = paymentsRes.data?.reduce((sum, a) => sum + Number(a.assigned_value || 0), 0) || 0;

    setStats({
      totalShifts: shiftsRes.count || 0,
      totalUsers: membersRes.count || 0,
      pendingSwaps: swapsRes.count || 0,
      monthlyValue,
    });
    setLoading(false);
  }

  const statCards = [
    { title: 'Plantões', value: stats.totalShifts, icon: Calendar, color: 'text-blue-500' },
    { title: 'Membros', value: stats.totalUsers, icon: Users, color: 'text-green-500' },
    { title: 'Trocas Pendentes', value: stats.pendingSwaps, icon: ArrowLeftRight, color: 'text-orange-500' },
    { title: 'Valor do Mês', value: `R$ ${stats.monthlyValue.toFixed(2)}`, icon: DollarSign, color: 'text-primary' },
  ];

  if (loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Visão geral do hospital</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atividade Recente</CardTitle>
          <CardDescription>Últimas movimentações do hospital</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade recente para exibir.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
