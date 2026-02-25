import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, ArrowRight, Stethoscope, LogOut, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Onboarding() {
  const { user, signOut } = useAuth();
  const { memberships, refreshMemberships, setCurrentTenant } = useTenant();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const handleSelectTenant = async (tenantId: string, role: string) => {
    setCurrentTenant(tenantId);
    if (role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/app');
    }
  };

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !tenantName || !tenantSlug) return;

    if (tenantSlug.trim().toLowerCase() === 'gabs') {
      toast({
        title: 'Código reservado',
        description: 'Escolha outro código para o hospital/serviço.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    const { data: tenantId, error } = await supabase.rpc('create_tenant_with_admin', {
      _name: tenantName,
      _slug: tenantSlug
    });

    if (error) {
      toast({
        title: 'Erro ao criar hospital',
        description: error.code === '23505' ? 'Este código já está em uso' : error.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

toast({ title: 'Hospital criado com sucesso!' });

await refreshMemberships();

if (tenantId) {
  setCurrentTenant(tenantId);
}

setDialogOpen(false);
navigate('/admin');
setLoading(false);
}
  async function handleJoinByInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !inviteCode) return;

    setLoading(true);

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
    setDialogOpen(false);
    navigate('/app');
    setLoading(false);
  }

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const hasMemberships = memberships && memberships.length > 0;

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-primary/80 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAzMHYySDI0di0yaDEyek0zNiAyNnYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
              <Stethoscope className="h-10 w-10" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">MedEscala</h1>
              <p className="text-white/80 text-lg">Gestão de Escalas Médicas</p>
            </div>
          </div>
          
          <div className="max-w-md text-center space-y-6">
            <p className="text-xl text-white/90">
              Organize plantões, gerencie equipes e acompanhe a escala do seu hospital de forma simples e eficiente.
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Content */}
      <div className="flex-1 flex flex-col bg-background">
        {/* Header */}
        <div className="flex justify-between items-center p-4 md:p-6 border-b">
          <div className="flex items-center gap-2 lg:hidden">
            <Stethoscope className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">MedEscala</span>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-4 md:p-8">
          <div className="w-full max-w-lg">
            {hasMemberships ? (
              /* User has hospitals - show selection */
              <div className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                    Selecione um Hospital
                  </h2>
                  <p className="text-muted-foreground mt-2">
                    Escolha o hospital que deseja acessar
                  </p>
                </div>

                <div className="space-y-3">
                  {memberships.map((membership) => (
                    <button
                      key={membership.tenant_id}
                      onClick={() => handleSelectTenant(membership.tenant_id, membership.role)}
                      className="w-full group"
                    >
                      <Card className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer">
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/10 rounded-xl">
                              <Building2 className="h-6 w-6 text-primary" />
                            </div>
                            <div className="text-left">
                              <h3 className="font-semibold text-lg">{membership.tenant_name}</h3>
                              <p className="text-sm text-muted-foreground capitalize">
                                {membership.role === 'admin' ? 'Administrador' : 'Plantonista'}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>

                <div className="pt-4 border-t">
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar outro hospital
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Adicionar Hospital</DialogTitle>
                        <DialogDescription>
                          Crie um novo hospital ou entre com código de convite
                        </DialogDescription>
                      </DialogHeader>
                      <AddHospitalTabs
                        tenantName={tenantName}
                        tenantSlug={tenantSlug}
                        inviteCode={inviteCode}
                        loading={loading}
                        onNameChange={handleNameChange}
                        onSlugChange={setTenantSlug}
                        onInviteCodeChange={setInviteCode}
                        onCreateTenant={handleCreateTenant}
                        onJoinByInvite={handleJoinByInvite}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ) : (
              /* New user - show create/join options */
              <div className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                    Bem-vindo ao MedEscala
                  </h2>
                  <p className="text-muted-foreground mt-2">
                    Para começar, crie um hospital ou entre em um existente
                  </p>
                </div>

                <div className="grid gap-4">
                  <Card 
                    className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
                    onClick={() => setDialogOpen(true)}
                  >
                    <CardContent className="p-6 flex items-center gap-4">
                      <div className="p-4 bg-primary/10 rounded-xl group-hover:bg-primary/20 transition-colors">
                        <Building2 className="h-8 w-8 text-primary" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-semibold text-lg">Criar Hospital</h3>
                        <p className="text-sm text-muted-foreground">
                          Sou administrador e quero cadastrar meu hospital
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </CardContent>
                  </Card>

                  <Card 
                    className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
                    onClick={() => {
                      setDialogOpen(true);
                    }}
                  >
                    <CardContent className="p-6 flex items-center gap-4">
                      <div className="p-4 bg-secondary/50 rounded-xl group-hover:bg-secondary transition-colors">
                        <Plus className="h-8 w-8 text-secondary-foreground" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-semibold text-lg">Entrar por Convite</h3>
                        <p className="text-sm text-muted-foreground">
                          Tenho um código de acesso do meu hospital
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </CardContent>
                  </Card>
                </div>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Configurar Acesso</DialogTitle>
                      <DialogDescription>
                        Crie um novo hospital ou entre com código de convite
                      </DialogDescription>
                    </DialogHeader>
                    <AddHospitalTabs
                      tenantName={tenantName}
                      tenantSlug={tenantSlug}
                      inviteCode={inviteCode}
                      loading={loading}
                      onNameChange={handleNameChange}
                      onSlugChange={setTenantSlug}
                      onInviteCodeChange={setInviteCode}
                      onCreateTenant={handleCreateTenant}
                      onJoinByInvite={handleJoinByInvite}
                    />
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AddHospitalTabsProps {
  tenantName: string;
  tenantSlug: string;
  inviteCode: string;
  loading: boolean;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onInviteCodeChange: (value: string) => void;
  onCreateTenant: (e: React.FormEvent) => void;
  onJoinByInvite: (e: React.FormEvent) => void;
}

function AddHospitalTabs({
  tenantName,
  tenantSlug,
  inviteCode,
  loading,
  onNameChange,
  onSlugChange,
  onInviteCodeChange,
  onCreateTenant,
  onJoinByInvite,
}: AddHospitalTabsProps) {
  return (
    <Tabs defaultValue="create" className="w-full mt-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="create">Criar Hospital</TabsTrigger>
        <TabsTrigger value="join">Entrar por Código</TabsTrigger>
      </TabsList>

      <TabsContent value="create" className="mt-4">
        <form onSubmit={onCreateTenant} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenantName">Nome do Hospital</Label>
            <Input
              id="tenantName"
              value={tenantName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Hospital Santa Maria"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenantSlug">Código de Acesso</Label>
            <Input
              id="tenantSlug"
              value={tenantSlug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="hospital-santa-maria"
              required
            />
            <p className="text-xs text-muted-foreground">
              Compartilhe este código com sua equipe
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Criando...' : 'Criar Hospital'}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="join" className="mt-4">
        <form onSubmit={onJoinByInvite} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inviteCode">Código de Convite</Label>
            <Input
              id="inviteCode"
              value={inviteCode}
              onChange={(e) => onInviteCodeChange(e.target.value)}
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
  );
}
