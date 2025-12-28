import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format, addMonths, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Building2, 
  Users, 
  Calendar, 
  Shield, 
  Infinity, 
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Edit,
  LogOut,
  RefreshCw,
  Stethoscope,
  Search,
  Database
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  billing_status: string;
  is_unlimited: boolean;
  trial_ends_at: string | null;
  current_users_count: number;
  max_users: number;
  plan_name: string | null;
  created_at: string;
}

export default function SuperAdmin() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [migratingPii, setMigratingPii] = useState(false);

  // Edit form state
  const [editBillingStatus, setEditBillingStatus] = useState('');
  const [editIsUnlimited, setEditIsUnlimited] = useState(false);
  const [editTrialMonths, setEditTrialMonths] = useState(1);

  async function handleMigratePii() {
    setMigratingPii(true);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-pii');
      
      if (error) throw error;
      
      toast({
        title: 'Migração concluída!',
        description: `${data.migrated} perfis migrados de ${data.total} total.`,
      });
      
      if (data.errors && data.errors.length > 0) {
        console.error('Migration errors:', data.errors);
      }
    } catch (err: any) {
      toast({
        title: 'Erro na migração',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setMigratingPii(false);
    }
  }

  useEffect(() => {
    checkSuperAdminAndFetch();
  }, [user]);

  async function checkSuperAdminAndFetch() {
    if (!user) {
      setLoading(false);
      return;
    }

    // Check if user is super admin
    const { data: isSA } = await supabase.rpc('is_super_admin');
    
    if (!isSA) {
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    setIsSuperAdmin(true);
    await fetchTenants();
    setLoading(false);
  }

  async function fetchTenants() {
    const { data, error } = await supabase.rpc('get_all_tenants_admin');

    if (error) {
      console.error('Error fetching tenants:', error);
      toast({
        title: 'Erro ao carregar hospitais',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setTenants(data || []);
  }

  function openEditDialog(tenant: Tenant) {
    setSelectedTenant(tenant);
    setEditBillingStatus(tenant.billing_status);
    setEditIsUnlimited(tenant.is_unlimited);
    setEditTrialMonths(1);
    setEditDialogOpen(true);
  }

  async function handleSaveChanges() {
    if (!selectedTenant) return;

    setSaving(true);

    // Calculate new trial end date if extending
    let newTrialEndsAt = null;
    if (editBillingStatus === 'trial' && !editIsUnlimited) {
      newTrialEndsAt = endOfMonth(addMonths(new Date(), editTrialMonths)).toISOString();
    }

    const { error } = await supabase.rpc('update_tenant_access', {
      _tenant_id: selectedTenant.id,
      _billing_status: editBillingStatus,
      _is_unlimited: editIsUnlimited,
      _trial_ends_at: newTrialEndsAt,
    });

    setSaving(false);

    if (error) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Hospital atualizado!' });
    setEditDialogOpen(false);
    fetchTenants();
  }

  function getStatusBadge(tenant: Tenant) {
    if (tenant.is_unlimited) {
      return (
        <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">
          <Infinity className="h-3 w-3 mr-1" />
          Ilimitado
        </Badge>
      );
    }

    if (tenant.billing_status === 'active') {
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle className="h-3 w-3 mr-1" />
          Ativo
        </Badge>
      );
    }

    if (tenant.billing_status === 'expired') {
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/20">
          <XCircle className="h-3 w-3 mr-1" />
          Expirado
        </Badge>
      );
    }

    // Trial status
    const trialEndsAt = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
    const now = new Date();
    const isExpired = trialEndsAt && trialEndsAt < now;
    const daysRemaining = trialEndsAt 
      ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) 
      : 0;

    if (isExpired) {
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/20">
          <XCircle className="h-3 w-3 mr-1" />
          Trial Expirado
        </Badge>
      );
    }

    if (daysRemaining <= 7) {
      return (
        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Trial ({daysRemaining}d)
        </Badge>
      );
    }

    return (
      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
        <Clock className="h-3 w-3 mr-1" />
        Trial ({daysRemaining}d)
      </Badge>
    );
  }

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.billing_status === 'active' || t.is_unlimited).length,
    trial: tenants.filter(t => t.billing_status === 'trial' && !t.is_unlimited).length,
    expired: tenants.filter(t => {
      if (t.is_unlimited || t.billing_status === 'active') return false;
      if (t.billing_status === 'expired') return true;
      if (t.trial_ends_at && new Date(t.trial_ends_at) < new Date()) return true;
      return false;
    }).length,
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Verificando permissões...</div>
      </div>
    );
  }

  if (!user) {
    navigate('/auth');
    return null;
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Shield className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Acesso Negado</CardTitle>
            <CardDescription>
              Você não tem permissão para acessar esta página.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/home')} className="w-full">
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-purple-600 text-white">
                <Shield className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold text-foreground">
                Super<span className="text-purple-600">Admin</span>
              </span>
            </div>
            <Badge variant="outline" className="text-purple-600 border-purple-600">
              Master
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => signOut()}
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 lg:p-8 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Hospitais</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Ativos/Ilimitados</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Em Trial</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.trial}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Expirados</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.expired}</div>
            </CardContent>
          </Card>
        </div>

        {/* Security Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Segurança de Dados
            </CardTitle>
            <CardDescription>
              Ferramentas de migração e proteção de dados sensíveis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleMigratePii} 
              disabled={migratingPii}
              variant="outline"
            >
              {migratingPii ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Migrando...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Migrar dados PII para colunas criptografadas
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Converte CPF, CRM, telefone, endereço e dados bancários para armazenamento criptografado.
            </p>
          </CardContent>
        </Card>

        {/* Tenants Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Hospitais Cadastrados</CardTitle>
                <CardDescription>Gerencie o acesso de todos os hospitais</CardDescription>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar hospital..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={fetchTenants}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usuários</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhum hospital encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTenants.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-medium">{tenant.name}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {tenant.slug}
                          </code>
                        </TableCell>
                        <TableCell>{getStatusBadge(tenant)}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {tenant.current_users_count}/{tenant.max_users}
                          </span>
                        </TableCell>
                        <TableCell>
                          {tenant.is_unlimited ? (
                            <span className="text-purple-600">Nunca</span>
                          ) : tenant.trial_ends_at ? (
                            format(new Date(tenant.trial_ends_at), "dd/MM/yyyy", { locale: ptBR })
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(tenant.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(tenant)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Acesso - {selectedTenant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Acesso Ilimitado</Label>
                <p className="text-sm text-muted-foreground">
                  Remove todas as restrições de trial
                </p>
              </div>
              <Switch
                checked={editIsUnlimited}
                onCheckedChange={setEditIsUnlimited}
              />
            </div>

            {!editIsUnlimited && (
              <>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editBillingStatus} onValueChange={setEditBillingStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="active">Ativo (Pago)</SelectItem>
                      <SelectItem value="expired">Expirado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {editBillingStatus === 'trial' && (
                  <div className="space-y-2">
                    <Label>Estender Trial por</Label>
                    <Select 
                      value={editTrialMonths.toString()} 
                      onValueChange={(v) => setEditTrialMonths(parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 mês</SelectItem>
                        <SelectItem value="2">2 meses</SelectItem>
                        <SelectItem value="3">3 meses</SelectItem>
                        <SelectItem value="6">6 meses</SelectItem>
                        <SelectItem value="12">12 meses</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Novo vencimento: {format(endOfMonth(addMonths(new Date(), editTrialMonths)), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveChanges} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
