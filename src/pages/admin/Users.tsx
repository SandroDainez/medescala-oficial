import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Shield, User, UserPlus, Trash2, Copy } from 'lucide-react';

interface MemberWithProfile {
  id: string;
  user_id: string;
  role: 'admin' | 'user';
  active: boolean;
  profile: { name: string | null } | null;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const { currentTenantId, currentTenantName } = useTenant();
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');

  useEffect(() => {
    if (currentTenantId) {
      fetchMembers();
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

  async function toggleRole(membershipId: string, currentRole: 'admin' | 'user') {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';

    const { error } = await supabase
      .from('memberships')
      .update({ role: newRole })
      .eq('id', membershipId);

    if (error) {
      toast({ title: 'Erro ao alterar role', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Usuário ${newRole === 'admin' ? 'promovido a admin' : 'rebaixado para user'}` });
      fetchMembers();
    }
  }

  async function toggleActive(membershipId: string, currentActive: boolean) {
    const { error } = await supabase
      .from('memberships')
      .update({ active: !currentActive })
      .eq('id', membershipId);

    if (error) {
      toast({ title: 'Erro ao alterar status', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: currentActive ? 'Membro desativado' : 'Membro ativado' });
      fetchMembers();
    }
  }

  async function removeMember(membershipId: string, userId: string) {
    if (userId === user?.id) {
      toast({ title: 'Erro', description: 'Você não pode remover a si mesmo', variant: 'destructive' });
      return;
    }

    if (!confirm('Deseja remover este membro do hospital?')) return;

    const { error } = await supabase.from('memberships').delete().eq('id', membershipId);

    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Membro removido!' });
      fetchMembers();
    }
  }

  async function copyInviteCode() {
    // Get tenant slug
    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', currentTenantId)
      .single();

    if (tenant?.slug) {
      await navigator.clipboard.writeText(tenant.slug);
      toast({ title: 'Código copiado!', description: `Compartilhe: ${tenant.slug}` });
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Usuários</h2>
          <p className="text-muted-foreground">Gerencie os membros do hospital</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyInviteCode}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar Código de Convite
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nenhum membro cadastrado
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.profile?.name || 'Sem nome'}</TableCell>
                    <TableCell>
                      <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                        {member.role === 'admin' ? (
                          <><Shield className="mr-1 h-3 w-3" /> Admin</>
                        ) : (
                          <><User className="mr-1 h-3 w-3" /> Usuário</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.active ? 'outline' : 'secondary'}>
                        {member.active ? 'Ativo' : 'Inativo'}
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
                          {member.role === 'admin' ? 'Rebaixar' : 'Promover'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(member.id, member.active)}
                          disabled={member.user_id === user?.id}
                        >
                          {member.active ? 'Desativar' : 'Ativar'}
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
    </div>
  );
}
