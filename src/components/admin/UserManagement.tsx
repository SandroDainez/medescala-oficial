import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Shield, User, UserPlus, Trash2, Copy, Mail, Users, UserCheck, UserX } from 'lucide-react';

interface MemberWithProfile {
  id: string;
  user_id: string;
  role: 'admin' | 'user';
  active: boolean;
  profile: { name: string | null } | null;
}

interface TenantInfo {
  slug: string;
  max_users: number;
  current_users_count: number;
}

export default function UserManagement() {
  const { user } = useAuth();
  const { currentTenantId, currentTenantName } = useTenant();
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [invitePassword, setInvitePassword] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  useEffect(() => {
    if (currentTenantId) {
      fetchMembers();
      fetchTenantInfo();
    }
  }, [currentTenantId]);

  async function fetchMembers() {
    if (!currentTenantId) return;
    
    const { data, error } = await supabase
      .from('memberships')
      .select('id, user_id, role, active, profile:profiles!memberships_user_id_profiles_fkey(name)')
      .eq('tenant_id', currentTenantId);

    if (!error && data) {
      setMembers(data as unknown as MemberWithProfile[]);
    }
    setLoading(false);
  }

  async function fetchTenantInfo() {
    if (!currentTenantId) return;

    const { data } = await supabase
      .from('tenants')
      .select('slug, max_users, current_users_count')
      .eq('id', currentTenantId)
      .single();

    if (data) {
      setTenantInfo(data);
    }
  }

  async function toggleRole(membershipId: string, currentRole: 'admin' | 'user') {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';

    const { error } = await supabase
      .from('memberships')
      .update({ role: newRole, updated_by: user?.id })
      .eq('id', membershipId);

    if (error) {
      toast({ title: 'Erro ao alterar perfil', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Usuário ${newRole === 'admin' ? 'promovido a administrador' : 'alterado para usuário comum'}` });
      fetchMembers();
    }
  }

  async function toggleActive(membershipId: string, currentActive: boolean) {
    const { error } = await supabase
      .from('memberships')
      .update({ active: !currentActive, updated_by: user?.id })
      .eq('id', membershipId);

    if (error) {
      toast({ title: 'Erro ao alterar status', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: currentActive ? 'Membro desativado' : 'Membro ativado' });
      fetchMembers();
      fetchTenantInfo();
    }
  }

  async function removeMember(membershipId: string, userId: string) {
    if (userId === user?.id) {
      toast({ title: 'Erro', description: 'Você não pode remover a si mesmo', variant: 'destructive' });
      return;
    }

    if (!confirm('Deseja remover este membro do hospital? Ele perderá acesso a todos os dados.')) return;

    const { error } = await supabase.from('memberships').delete().eq('id', membershipId);

    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Membro removido!' });
      fetchMembers();
      fetchTenantInfo();
    }
  }

  async function copyInviteCode() {
    if (tenantInfo?.slug) {
      await navigator.clipboard.writeText(tenantInfo.slug);
      toast({ 
        title: 'Código copiado!', 
        description: `Compartilhe o código "${tenantInfo.slug}" para novos usuários se cadastrarem no onboarding.` 
      });
    }
  }

  async function handleInviteUser(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTenantId || !inviteEmail || !invitePassword) return;

    setIsCreatingUser(true);

    try {
      // Check if we can add more users
      if (tenantInfo && tenantInfo.current_users_count >= tenantInfo.max_users) {
        toast({
          title: 'Limite atingido',
          description: `O hospital já possui ${tenantInfo.max_users} usuários. Faça upgrade do plano para adicionar mais.`,
          variant: 'destructive'
        });
        return;
      }

      // Create user via supabase auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: inviteEmail,
        password: invitePassword,
        options: {
          data: {
            name: inviteName || inviteEmail.split('@')[0],
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Wait a bit for the trigger to create the profile
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Add membership
        const { error: membershipError } = await supabase.from('memberships').insert({
          tenant_id: currentTenantId,
          user_id: authData.user.id,
          role: inviteRole,
          active: true,
          created_by: user?.id,
        });

        if (membershipError) throw membershipError;

        toast({ 
          title: 'Usuário criado!', 
          description: `${inviteName || inviteEmail} foi adicionado ao hospital.` 
        });
        
        setInviteDialogOpen(false);
        setInviteEmail('');
        setInviteName('');
        setInvitePassword('');
        setInviteRole('user');
        fetchMembers();
        fetchTenantInfo();
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({ 
        title: 'Erro ao criar usuário', 
        description: error.message || 'Não foi possível criar o usuário',
        variant: 'destructive' 
      });
    } finally {
      setIsCreatingUser(false);
    }
  }

  const activeMembers = members.filter(m => m.active);
  const inactiveMembers = members.filter(m => !m.active);
  const admins = members.filter(m => m.role === 'admin' && m.active);

  if (loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Membros</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
            {tenantInfo && (
              <p className="text-xs text-muted-foreground">
                Limite: {tenantInfo.max_users} usuários
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle>
            <UserCheck className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeMembers.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inativos</CardTitle>
            <UserX className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveMembers.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Administradores</CardTitle>
            <Shield className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{admins.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gestão de Usuários</h2>
          <p className="text-muted-foreground">Adicione, remova e gerencie permissões dos membros</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyInviteCode}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar Código
          </Button>
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Adicionar Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Novo Usuário</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleInviteUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inviteName">Nome Completo</Label>
                  <Input
                    id="inviteName"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Nome do usuário"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail">E-mail</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invitePassword">Senha Inicial</Label>
                  <Input
                    id="invitePassword"
                    type="password"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="Senha de acesso"
                    minLength={6}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    O usuário poderá alterar a senha depois
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'user')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>Plantonista</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <span>Administrador</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={isCreatingUser}>
                  {isCreatingUser ? 'Criando...' : 'Criar Usuário'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Users Table */}
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Ativos ({activeMembers.length})
          </TabsTrigger>
          <TabsTrigger value="inactive">
            Inativos ({inactiveMembers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhum membro ativo
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.profile?.name || 'Sem nome'}
                          {member.user_id === user?.id && (
                            <Badge variant="outline" className="ml-2">Você</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                            {member.role === 'admin' ? (
                              <><Shield className="mr-1 h-3 w-3" /> Administrador</>
                            ) : (
                              <><User className="mr-1 h-3 w-3" /> Plantonista</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleRole(member.id, member.role)}
                              disabled={member.user_id === user?.id}
                            >
                              {member.role === 'admin' ? 'Tornar Plantonista' : 'Tornar Admin'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActive(member.id, member.active)}
                              disabled={member.user_id === user?.id}
                            >
                              Desativar
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeMember(member.id, member.user_id)}
                              disabled={member.user_id === user?.id}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inactive">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inactiveMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhum membro inativo
                      </TableCell>
                    </TableRow>
                  ) : (
                    inactiveMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium text-muted-foreground">
                          {member.profile?.name || 'Sem nome'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {member.role === 'admin' ? 'Administrador' : 'Plantonista'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleActive(member.id, member.active)}
                            >
                              Reativar
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeMember(member.id, member.user_id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como adicionar usuários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</div>
            <div>
              <strong className="text-foreground">Adicionar diretamente:</strong> Clique em "Adicionar Usuário" e preencha os dados. O usuário receberá acesso imediato.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</div>
            <div>
              <strong className="text-foreground">Via código:</strong> Compartilhe o código "{tenantInfo?.slug}" para que o usuário entre durante o cadastro.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
