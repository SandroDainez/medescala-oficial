import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Check, Users, Crown, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface SubscriptionInfo {
  plan_name: string;
  max_users: number;
  current_users: number;
  price_monthly: number;
  billing_status: string;
  trial_ends_at: string | null;
  features: string[];
}

interface Plan {
  id: string;
  name: string;
  min_users: number;
  max_users: number;
  price_monthly: number;
  features: string[];
}

export default function Subscription() {
  const { currentTenantId } = useTenant();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentTenantId) {
      fetchSubscription();
      fetchPlans();
    }
  }, [currentTenantId]);

  const fetchSubscription = async () => {
    const { data, error } = await supabase.rpc('get_tenant_subscription', {
      _tenant_id: currentTenantId
    });

    if (!error && data && data.length > 0) {
      const sub = data[0];
      setSubscription({
        ...sub,
        features: typeof sub.features === 'string' ? JSON.parse(sub.features) : sub.features || []
      });
    }
    setLoading(false);
  };

  const fetchPlans = async () => {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('active', true)
      .order('price_monthly', { ascending: true });

    if (!error && data) {
      setPlans(data.map(p => ({
        ...p,
        features: typeof p.features === 'string' ? JSON.parse(p.features) : p.features || []
      })));
    }
  };

  const handleUpgrade = async (planId: string) => {
    const { error } = await supabase
      .from('tenants')
      .update({ plan_id: planId })
      .eq('id', currentTenantId);

    if (error) {
      toast.error('Erro ao atualizar plano');
    } else {
      toast.success('Plano atualizado com sucesso!');
      fetchSubscription();
    }
  };

  const usagePercentage = subscription 
    ? (subscription.current_users / subscription.max_users) * 100 
    : 0;

  const getPlanIcon = (name: string) => {
    if (name.toLowerCase().includes('enterprise')) return <Crown className="h-6 w-6" />;
    if (name.toLowerCase().includes('profissional')) return <Zap className="h-6 w-6" />;
    return <Users className="h-6 w-6" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinatura</h1>
        <p className="text-muted-foreground">Gerencie seu plano e veja o uso atual</p>
      </div>

      {/* Current Plan */}
      {subscription && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
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
                  Você está usando {usagePercentage.toFixed(0)}% do limite de usuários
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-background border">
                <p className="text-sm text-muted-foreground">Preço mensal</p>
                <p className="text-2xl font-bold">
                  {subscription.price_monthly === 0 ? 'Grátis' : `R$ ${subscription.price_monthly}`}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-background border">
                <p className="text-sm text-muted-foreground">Limite de usuários</p>
                <p className="text-2xl font-bold">{subscription.max_users}</p>
              </div>
            </div>

            {subscription.features && subscription.features.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Recursos incluídos:</p>
                <ul className="space-y-1">
                  {subscription.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Available Plans */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Planos disponíveis</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrentPlan = subscription?.plan_name === plan.name;
            const canUpgrade = subscription && plan.max_users > (subscription.max_users || 0);
            
            return (
              <Card 
                key={plan.id} 
                className={isCurrentPlan ? 'border-primary ring-2 ring-primary/20' : ''}
              >
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {getPlanIcon(plan.name)}
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                  </div>
                  <CardDescription>
                    {plan.min_users === plan.max_users 
                      ? `${plan.max_users} usuários`
                      : `${plan.min_users} - ${plan.max_users} usuários`
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-3xl font-bold">
                      {plan.price_monthly === 0 ? 'Grátis' : `R$ ${plan.price_monthly}`}
                    </span>
                    {plan.price_monthly > 0 && (
                      <span className="text-muted-foreground">/mês</span>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrentPlan ? (
                    <Button className="w-full" variant="outline" disabled>
                      Plano atual
                    </Button>
                  ) : canUpgrade ? (
                    <Button className="w-full" onClick={() => handleUpgrade(plan.id)}>
                      Fazer upgrade
                    </Button>
                  ) : (
                    <Button className="w-full" variant="outline" disabled>
                      Plano menor
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
