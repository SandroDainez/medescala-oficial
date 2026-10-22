import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Users, Crown, Zap, ArrowUpRight } from 'lucide-react';
import { moeda } from '@/lib/relatorios/tabelaDoRelatorio';
import {
  descreverFaixa,
  direcaoDaMudanca,
  percentualDeUso,
  proximaFaixa,
  vagasRestantes,
  type PlanoDisponivel,
} from '@/lib/planoDoServico';

// Duas mudanças podem cair no mesmo dia; sem a hora elas ficam idênticas na
// lista. Fuso fixo de Brasília: a data não pode mudar conforme o aparelho.
function dataHoraDaMudanca(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SubscriptionInfo {
  plan_name: string;
  max_users: number;
  current_users: number;
  price_monthly: number | null;
  billing_status: string;
  trial_ends_at: string | null;
}

interface MudancaDePlano {
  id: string;
  from_plan_name: string | null;
  to_plan_name: string;
  from_price_monthly: number | string | null;
  to_price_monthly: number | string | null;
  users_count: number;
  origin: string;
  changed_at: string;
}

const ORIGEM: Record<string, string> = {
  automatico: 'Automática, pelo número de usuários',
  super_admin: 'Ajuste do MedEscala',
  admin_hospital: 'Solicitada pelo serviço',
};

export default function Subscription() {
  const { currentTenantId } = useTenant();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [planos, setPlanos] = useState<PlanoDisponivel[]>([]);
  const [mudancas, setMudancas] = useState<MudancaDePlano[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_tenant_subscription', {
      _tenant_id: currentTenantId
    });

    if (!error && data && data.length > 0) {
      const sub = data[0];
      setSubscription({
        plan_name: sub.plan_name,
        max_users: sub.max_users,
        current_users: sub.current_users,
        price_monthly: sub.price_monthly === null || sub.price_monthly === undefined
          ? null
          : Number(sub.price_monthly),
        billing_status: sub.billing_status,
        trial_ends_at: sub.trial_ends_at
      });
    }
    setLoading(false);
  }, [currentTenantId]);

  const fetchPlanos = useCallback(async () => {
    const { data, error } = await supabase
      .from('plans')
      .select('id, name, min_users, max_users, price_monthly')
      .eq('active', true)
      .order('max_users', { ascending: true });

    if (!error && data) {
      setPlanos(data as PlanoDisponivel[]);
    }
  }, []);

  const fetchMudancas = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc('list_tenant_plan_changes', {
      _tenant_id: currentTenantId,
    });

    if (!error && data) {
      setMudancas(data as MudancaDePlano[]);
    }
  }, [currentTenantId]);

  useEffect(() => {
    if (currentTenantId) {
      fetchSubscription();
      fetchPlanos();
      fetchMudancas();
    }
  }, [currentTenantId, fetchSubscription, fetchPlanos, fetchMudancas]);

  const getPlanIcon = (name: string) => {
    if (name.toLowerCase().includes('201+')) return <Crown className="h-6 w-6" />;
    if (name.toLowerCase().includes('teste')) return <Zap className="h-6 w-6" />;
    return <Users className="h-6 w-6" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const usagePercentage = percentualDeUso(subscription?.current_users, subscription?.max_users);
  const vagas = vagasRestantes(subscription?.current_users, subscription?.max_users);
  const faixaSeguinte = proximaFaixa(planos, subscription?.max_users);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinatura</h1>
        <p className="text-muted-foreground">Seu plano e o uso atual do serviço</p>
      </div>

      {subscription && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {getPlanIcon(subscription.plan_name)}
                <div>
                  <CardTitle className="text-xl">{subscription.plan_name}</CardTitle>
                  <CardDescription>Plano atual</CardDescription>
                </div>
              </div>
              <Badge variant={subscription.billing_status === 'active' ? 'default' : 'destructive'}>
                {subscription.billing_status === 'active' ? 'Ativo' : subscription.billing_status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Usuários ativos</span>
                <span className="font-medium">
                  {subscription.current_users} / {subscription.max_users}
                </span>
              </div>
              <Progress value={usagePercentage} className="h-2" />
              {usagePercentage >= 80 && (
                <p className="text-sm text-amber-600 mt-2">
                  {vagas > 0
                    ? `Restam ${vagas} ${vagas === 1 ? 'vaga' : 'vagas'} nesta faixa.`
                    : 'Esta faixa está no limite.'}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-lg bg-background border">
                <p className="text-sm text-muted-foreground">Mensalidade</p>
                <p className="text-2xl font-bold">
                  {subscription.price_monthly === null ? '—' : moeda(subscription.price_monthly)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">por mês</p>
              </div>
              <div className="p-4 rounded-lg bg-background border">
                <p className="text-sm text-muted-foreground">Limite de usuários</p>
                <p className="text-2xl font-bold">{subscription.max_users}</p>
                <p className="text-xs text-muted-foreground mt-1">nesta faixa</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* O serviço não escolhe plano. Esta tela existe para ele não descobrir a
          mudança de faixa pela fatura do mês seguinte. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Como funciona o seu plano</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            O plano acompanha o número de usuários ativos do serviço. Não é preciso contratar
            nada: ao cadastrar um usuário além do limite da faixa, o serviço passa
            automaticamente para a faixa seguinte, e a mensalidade passa a ser a dela.
          </p>
          {faixaSeguinte && (
            <div className="flex items-start gap-3 rounded-lg border bg-background p-4">
              <ArrowUpRight className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium text-foreground">
                  Acima de {subscription?.max_users} usuários: {faixaSeguinte.name}
                </p>
                <p>
                  {descreverFaixa(faixaSeguinte.min_users, faixaSeguinte.max_users)}
                  {faixaSeguinte.price_monthly !== null && faixaSeguinte.price_monthly !== undefined
                    ? ` — ${moeda(Number(faixaSeguinte.price_monthly))} por mês`
                    : ''}
                </p>
              </div>
            </div>
          )}
          <p>
            Para reduzir a faixa, desative os usuários que não fazem mais parte do serviço e
            fale com o MedEscala: o ajuste de mensalidade é feito por nós.
          </p>
        </CardContent>
      </Card>

      {mudancas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mudanças de plano</CardTitle>
            <CardDescription>Quando a faixa mudou e por quê</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mudancas.map((m) => {
              const direcao = direcaoDaMudanca(m.from_price_monthly, m.to_price_monthly);
              return (
                <div key={m.id} className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={direcao === 'subiu' ? 'default' : 'secondary'}>
                      {direcao === 'subiu' ? 'Mensalidade subiu' : direcao === 'reduziu' ? 'Mensalidade reduziu' : 'Mesma mensalidade'}
                    </Badge>
                    <span className="text-muted-foreground">{dataHoraDaMudanca(m.changed_at)}</span>
                  </div>
                  <p className="font-medium">
                    De {m.from_plan_name ?? '—'} para {m.to_plan_name}
                  </p>
                  <p className="text-muted-foreground">
                    Mensalidade de {moeda(Number(m.from_price_monthly ?? 0))} para{' '}
                    {moeda(Number(m.to_price_monthly ?? 0))}, com {m.users_count}{' '}
                    {m.users_count === 1 ? 'usuário ativo' : 'usuários ativos'}
                  </p>
                  <p className="text-muted-foreground text-xs">{ORIGEM[m.origin] ?? m.origin}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
