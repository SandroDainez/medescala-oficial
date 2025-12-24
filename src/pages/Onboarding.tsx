import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Building2, UserPlus } from 'lucide-react';

export default function Onboarding() {
  const { user } = useAuth();
  const { refreshMemberships } = useTenant();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (value: string) => {
    setTenantName(value);
    setTenantSlug(generateSlug(value));
  };

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !tenantName || !tenantSlug) return;

    setLoading(true);

    // Get default free plan
    const { data: freePlan } = await supabase
      .from('plans')
      .select('id')
      .eq('name', 'Gratuito')
      .single();

    if (!freePlan) {
      toast({ title: 'Erro ao obter plano padrão', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Create tenant with plan
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({ 
        name: tenantName, 
        slug: tenantSlug, 
        plan_id: freePlan.id,
        created_by: user.id 
      })
      .select()
      .single();

    if (tenantError) {
      toast({
        title: 'Erro ao criar hospital',
        description: tenantError.code === '23505' ? 'Este slug já está em uso' : tenantError.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    // Create membership as admin
    const { error: membershipError } = await supabase.from('memberships').insert({
      tenant_id: tenant.id,
      user_id: user.id,
      role: 'admin',
      created_by: user.id,
    });

    if (membershipError) {
      toast({ title: 'Erro ao criar membership', description: membershipError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    toast({ title: 'Hospital criado com sucesso!' });
    await refreshMemberships();
    navigate('/admin');
    setLoading(false);
  }

  async function handleJoinByInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !inviteCode) return;

    setLoading(true);

    // Find tenant by slug
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('slug', inviteCode.toLowerCase().trim())
      .maybeSingle();

    if (tenantError || !tenant) {
      toast({ title: 'Hospital não encontrado', description: 'Verifique o código de convite', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('memberships')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      toast({ title: 'Você já é membro deste hospital' });
      await refreshMemberships();
      navigate('/app');
      setLoading(false);
      return;
    }

    // Check if tenant can add more users
    const { data: canAdd } = await supabase.rpc('can_add_user_to_tenant', { _tenant_id: tenant.id });

    if (!canAdd) {
      toast({ 
        title: 'Limite de usuários atingido', 
        description: 'Este hospital atingiu o limite de usuários do plano atual',
        variant: 'destructive' 
      });
      setLoading(false);
      return;
    }

    // Create membership as user
    const { error: membershipError } = await supabase.from('memberships').insert({
      tenant_id: tenant.id,
      user_id: user.id,
      role: 'user',
      created_by: user.id,
    });

    if (membershipError) {
      toast({ title: 'Erro ao entrar no hospital', description: membershipError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    toast({ title: `Bem-vindo ao ${tenant.name}!` });
    await refreshMemberships();
    navigate('/app');
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Bem-vindo ao MedEscala</CardTitle>
          <CardDescription>Configure seu acesso ao sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">
                <Building2 className="mr-2 h-4 w-4" />
                Criar Hospital
              </TabsTrigger>
              <TabsTrigger value="join">
                <UserPlus className="mr-2 h-4 w-4" />
                Entrar por Convite
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="mt-6">
              <form onSubmit={handleCreateTenant} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenantName">Nome do Hospital</Label>
                  <Input
                    id="tenantName"
                    value={tenantName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Hospital Santa Maria"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenantSlug">Código de Acesso</Label>
                  <Input
                    id="tenantSlug"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    placeholder="hospital-santa-maria"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Compartilhe este código com sua equipe para que possam entrar
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Criando...' : 'Criar Hospital'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="join" className="mt-6">
              <form onSubmit={handleJoinByInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Código de Convite</Label>
                  <Input
                    id="inviteCode"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="hospital-santa-maria"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Peça ao administrador do hospital o código de acesso
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar no Hospital'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
