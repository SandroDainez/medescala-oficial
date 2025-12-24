import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Shield, User, UserPlus, Trash2, Copy, Users, UserCheck, UserX, Stethoscope, Building2, CreditCard, Phone, MapPin, FileText, Edit, Mail, Layers } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface MemberWithProfile {
  id: string;
  user_id: string;
  role: 'admin' | 'user';
  active: boolean;
  email?: string;
  profile: { 
    name: string | null;
    phone: string | null;
    cpf: string | null;
    crm: string | null;
    profile_type: string | null;
    address: string | null;
    bank_name: string | null;
    bank_agency: string | null;
    bank_account: string | null;
    pix_key: string | null;
  } | null;
}

interface TenantInfo {
  slug: string;
  max_users: number;
  current_users_count: number;
}

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

interface SectorMembership {
  id: string;
  sector_id: string;
  user_id: string;
}

export default function UserManagement() {
  const { user } = useAuth();
  const { currentTenantId, currentTenantName } = useTenant();
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sectorMemberships, setSectorMemberships] = useState<SectorMembership[]>([]);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberWithProfile | null>(null);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [editSectorIds, setEditSectorIds] = useState<string[]>([]);
  
  // Edit form fields
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editCrm, setEditCrm] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editBankAgency, setEditBankAgency] = useState('');
  const [editBankAccount, setEditBankAccount] = useState('');
  const [editPixKey, setEditPixKey] = useState('');
  const [editProfileType, setEditProfileType] = useState('');
  
  // Form fields
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [inviteProfileType, setInviteProfileType] = useState('plantonista');
  
  // Optional fields
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteCpf, setInviteCpf] = useState('');
  const [inviteCrm, setInviteCrm] = useState('');
  const [inviteAddress, setInviteAddress] = useState('');
  const [inviteBankName, setInviteBankName] = useState('');
  const [inviteBankAgency, setInviteBankAgency] = useState('');
  const [inviteBankAccount, setInviteBankAccount] = useState('');
  const [invitePixKey, setInvitePixKey] = useState('');

  useEffect(() => {
    if (currentTenantId) {
      fetchMembers();
      fetchTenantInfo();
      fetchSectors();
      fetchSectorMemberships();
    }
  }, [currentTenantId]);

  async function fetchMembers() {
    if (!currentTenantId) return;
    
    const { data, error } = await supabase
      .from('memberships')
      .select('id, user_id, role, active, profile:profiles!memberships_user_id_profiles_fkey(name, phone, cpf, crm, profile_type, address, bank_name, bank_agency, bank_account, pix_key)')
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

  async function fetchSectors() {
    if (!currentTenantId) return;

    const { data } = await supabase
      .from('sectors')
      .select('id, name, color')
      .eq('tenant_id', currentTenantId)
      .eq('active', true)
      .order('name');

    if (data) {
      setSectors(data);
    }
  }

  async function fetchSectorMemberships() {
    if (!currentTenantId) return;

    const { data } = await supabase
      .from('sector_memberships')
      .select('id, sector_id, user_id')
      .eq('tenant_id', currentTenantId);

    if (data) {
      setSectorMemberships(data);
    }
  }

  // Toggle sector membership for a user
  async function toggleSectorMembership(userId: string, sectorId: string) {
    if (!currentTenantId) return;

    const existing = sectorMemberships.find(
      sm => sm.user_id === userId && sm.sector_id === sectorId
    );

    if (existing) {
      // Remove membership
      const { error } = await supabase
        .from('sector_memberships')
        .delete()
        .eq('id', existing.id);

      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      } else {
        fetchSectorMemberships();
      }
    } else {
      // Add membership
      const { error } = await supabase
        .from('sector_memberships')
        .insert({
          tenant_id: currentTenantId,
          user_id: userId,
          sector_id: sectorId,
          created_by: user?.id,
        });

      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      } else {
        fetchSectorMemberships();
      }
    }
  }

  // Get sectors for a user
  function getUserSectors(userId: string): string[] {
    return sectorMemberships
      .filter(sm => sm.user_id === userId)
      .map(sm => sm.sector_id);
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

  function resetForm() {
    setInviteName('');
    setInviteEmail('');
    setInvitePassword('');
    setInviteRole('user');
    setInviteProfileType('plantonista');
    setInvitePhone('');
    setInviteCpf('');
    setInviteCrm('');
    setInviteAddress('');
    setInviteBankName('');
    setInviteBankAgency('');
    setInviteBankAccount('');
    setInvitePixKey('');
  }

  function openEditDialog(member: MemberWithProfile) {
    setEditingMember(member);
    setEditName(member.profile?.name || '');
    setEditEmail(''); 
    setEditPhone(member.profile?.phone || '');
    setEditCpf(member.profile?.cpf || '');
    setEditCrm(member.profile?.crm || '');
    setEditAddress(member.profile?.address || '');
    setEditBankName(member.profile?.bank_name || '');
    setEditBankAgency(member.profile?.bank_agency || '');
    setEditBankAccount(member.profile?.bank_account || '');
    setEditPixKey(member.profile?.pix_key || '');
    setEditProfileType(member.profile?.profile_type || 'plantonista');
    
    // Load user's current sectors
    const userSectors = sectorMemberships
      .filter(sm => sm.user_id === member.user_id)
      .map(sm => sm.sector_id);
    setEditSectorIds(userSectors);
    
    setEditDialogOpen(true);
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMember) return;

    setIsUpdatingUser(true);

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: editName,
          phone: editPhone || null,
          cpf: editCpf || null,
          crm: editCrm || null,
          address: editAddress || null,
          bank_name: editBankName || null,
          bank_agency: editBankAgency || null,
          bank_account: editBankAccount || null,
          pix_key: editPixKey || null,
          profile_type: editProfileType,
        })
        .eq('id', editingMember.user_id);

      if (profileError) throw profileError;

      // Update sector memberships
      // First, get current memberships for this user
      const currentMemberships = sectorMemberships.filter(sm => sm.user_id === editingMember.user_id);
      const currentSectorIds = currentMemberships.map(sm => sm.sector_id);

      // Sectors to add
      const sectorsToAdd = editSectorIds.filter(id => !currentSectorIds.includes(id));
      // Sectors to remove
      const sectorsToRemove = currentSectorIds.filter(id => !editSectorIds.includes(id));

      // Add new sector memberships
      if (sectorsToAdd.length > 0) {
        const newMemberships = sectorsToAdd.map(sectorId => ({
          tenant_id: currentTenantId,
          user_id: editingMember.user_id,
          sector_id: sectorId,
          created_by: user?.id,
        }));

        const { error: addError } = await supabase
          .from('sector_memberships')
          .insert(newMemberships);

        if (addError) throw addError;
      }

      // Remove old sector memberships
      if (sectorsToRemove.length > 0) {
        const idsToRemove = currentMemberships
          .filter(sm => sectorsToRemove.includes(sm.sector_id))
          .map(sm => sm.id);

        const { error: removeError } = await supabase
          .from('sector_memberships')
          .delete()
          .in('id', idsToRemove);

        if (removeError) throw removeError;
      }

      toast({ title: 'Usuário atualizado!' });
      setEditDialogOpen(false);
      setEditingMember(null);
      fetchMembers();
      fetchSectorMemberships();
    } catch (error: any) {
      toast({ 
        title: 'Erro ao atualizar', 
        description: error.message, 
        variant: 'destructive' 
      });
    } finally {
      setIsUpdatingUser(false);
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

  // Generate internal email from name
  function generateInternalEmail(name: string): string {
    const cleanName = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]/g, '.') // Replace special chars with dots
      .replace(/\.+/g, '.') // Remove consecutive dots
      .replace(/^\.|\.$/, ''); // Remove leading/trailing dots
    const random = Math.random().toString(36).substring(2, 8);
    return `${cleanName}.${random}@interno.hospital`;
  }

  async function handleInviteUser(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTenantId || !invitePassword || !inviteName) return;

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

      // Generate internal email if not provided
      const userEmail = inviteEmail.trim() || generateInternalEmail(inviteName);

      // Create user via supabase auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userEmail,
        password: invitePassword,
        options: {
          data: {
            name: inviteName,
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Wait a bit for the trigger to create the profile
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Update profile with additional info
        const profileUpdate: Record<string, string | null> = {
          profile_type: inviteProfileType,
        };
        
        if (invitePhone) profileUpdate.phone = invitePhone;
        if (inviteCpf) profileUpdate.cpf = inviteCpf;
        if (inviteCrm) profileUpdate.crm = inviteCrm;
        if (inviteAddress) profileUpdate.address = inviteAddress;
        if (inviteBankName) profileUpdate.bank_name = inviteBankName;
        if (inviteBankAgency) profileUpdate.bank_agency = inviteBankAgency;
        if (inviteBankAccount) profileUpdate.bank_account = inviteBankAccount;
        if (invitePixKey) profileUpdate.pix_key = invitePixKey;

        await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', authData.user.id);

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
          description: `${inviteName} foi adicionado ao hospital.` 
        });
        
        // Reset all form fields
        resetForm();
        setInviteDialogOpen(false);
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
            <DialogContent className="max-w-2xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Adicionar Novo Usuário</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[70vh] pr-4">
                <form onSubmit={handleInviteUser} className="space-y-6">
                  {/* Required Fields */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <User className="h-4 w-4" />
                      Dados Obrigatórios
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="inviteName">Nome Completo *</Label>
                        <Input
                          id="inviteName"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                          placeholder="Nome do usuário"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteEmail">E-mail (opcional)</Label>
                        <Input
                          id="inviteEmail"
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Deixe em branco para gerar automático"
                        />
                        <p className="text-xs text-muted-foreground">
                          Se não informado, será gerado um email interno
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="invitePassword">Senha Inicial *</Label>
                        <Input
                          id="invitePassword"
                          type="password"
                          value={invitePassword}
                          onChange={(e) => setInvitePassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          minLength={6}
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          O usuário poderá alterar depois
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo de Perfil *</Label>
                        <Select value={inviteProfileType} onValueChange={setInviteProfileType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="plantonista">
                              <div className="flex items-center gap-2">
                                <Stethoscope className="h-4 w-4" />
                                <span>Plantonista</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="administrador">
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                <span>Administrador</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="outros">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <span>Outros</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Permissão no Sistema *</Label>
                      <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'user')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Usuário comum (pode ver e atualizar próprios dados)</SelectItem>
                          <SelectItem value="admin">Administrador (acesso total ao sistema)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  {/* Optional - Personal Data */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Dados Pessoais (opcional)
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="invitePhone">Telefone</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="invitePhone"
                            value={invitePhone}
                            onChange={(e) => setInvitePhone(e.target.value)}
                            placeholder="(00) 00000-0000"
                            className="pl-10"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteCpf">CPF</Label>
                        <Input
                          id="inviteCpf"
                          value={inviteCpf}
                          onChange={(e) => setInviteCpf(e.target.value)}
                          placeholder="000.000.000-00"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="inviteCrm">CRM (se médico)</Label>
                        <div className="relative">
                          <Stethoscope className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="inviteCrm"
                            value={inviteCrm}
                            onChange={(e) => setInviteCrm(e.target.value)}
                            placeholder="CRM/UF 000000"
                            className="pl-10"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteAddress">Endereço</Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="inviteAddress"
                            value={inviteAddress}
                            onChange={(e) => setInviteAddress(e.target.value)}
                            placeholder="Rua, número, cidade"
                            className="pl-10"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Optional - Bank Data */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <CreditCard className="h-4 w-4" />
                      Dados Bancários (opcional - para pagamentos)
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="inviteBankName">Banco</Label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="inviteBankName"
                            value={inviteBankName}
                            onChange={(e) => setInviteBankName(e.target.value)}
                            placeholder="Nome do banco"
                            className="pl-10"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invitePixKey">Chave PIX</Label>
                        <Input
                          id="invitePixKey"
                          value={invitePixKey}
                          onChange={(e) => setInvitePixKey(e.target.value)}
                          placeholder="CPF, e-mail, telefone ou chave aleatória"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="inviteBankAgency">Agência</Label>
                        <Input
                          id="inviteBankAgency"
                          value={inviteBankAgency}
                          onChange={(e) => setInviteBankAgency(e.target.value)}
                          placeholder="0000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteBankAccount">Conta</Label>
                        <Input
                          id="inviteBankAccount"
                          value={inviteBankAccount}
                          onChange={(e) => setInviteBankAccount(e.target.value)}
                          placeholder="00000-0"
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isCreatingUser}>
                    {isCreatingUser ? 'Criando...' : 'Criar Usuário'}
                  </Button>
                </form>
              </ScrollArea>
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
                    <TableHead>Perfil / Setores</TableHead>
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
                    activeMembers.map((member) => {
                      const userSectorIds = getUserSectors(member.user_id);
                      const userSectorsNames = sectors
                        .filter(s => userSectorIds.includes(s.id))
                        .map(s => s.name);
                      
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            {member.profile?.name || 'Sem nome'}
                            {member.user_id === user?.id && (
                              <Badge variant="outline" className="ml-2">Você</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                                {member.role === 'admin' ? (
                                  <><Shield className="mr-1 h-3 w-3" /> Admin</>
                                ) : (
                                  <><User className="mr-1 h-3 w-3" /> Plantonista</>
                                )}
                              </Badge>
                              
                              {/* Setores Popover - só para plantonistas */}
                              {member.role === 'user' && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-7 gap-1">
                                      <Layers className="h-3 w-3" />
                                      {userSectorIds.length > 0 
                                        ? `${userSectorIds.length} setor${userSectorIds.length > 1 ? 'es' : ''}`
                                        : 'Setores'
                                      }
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-64 p-3" align="start">
                                    <div className="space-y-3">
                                      <div className="font-medium text-sm">Selecione os setores</div>
                                      <div className="space-y-2">
                                        {sectors.length === 0 ? (
                                          <p className="text-sm text-muted-foreground">Nenhum setor cadastrado</p>
                                        ) : (
                                          sectors.map(sector => {
                                            const isInSector = userSectorIds.includes(sector.id);
                                            const toggle = () => toggleSectorMembership(member.user_id, sector.id);

                                            return (
                                              <button
                                                type="button"
                                                key={sector.id}
                                                className="flex w-full items-center gap-2 rounded-sm p-1 text-left hover:bg-accent"
                                                onClick={toggle}
                                              >
                                                <Checkbox
                                                  id={`sector-${member.user_id}-${sector.id}`}
                                                  checked={isInSector}
                                                  onCheckedChange={toggle}
                                                  onClick={(e) => e.stopPropagation()}
                                                />
                                                <span
                                                  className="w-3 h-3 rounded-full shrink-0"
                                                  style={{ backgroundColor: sector.color || '#22c55e' }}
                                                />
                                                <span className="text-sm flex-1">{sector.name}</span>
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>
                                      {userSectorsNames.length > 0 && (
                                        <div className="pt-2 border-t">
                                          <p className="text-xs text-muted-foreground">
                                            Selecionados: {userSectorsNames.join(', ')}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(member)}
                                title="Editar usuário"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleRole(member.id, member.role)}
                                disabled={member.user_id === user?.id}
                              >
                                {member.role === 'admin' ? 'Plantonista' : 'Admin'}
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
                      );
                    })
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
                    <TableHead>Perfil / Setores</TableHead>
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
                    inactiveMembers.map((member) => {
                      const userSectorIds = getUserSectors(member.user_id);
                      const userSectorsNames = sectors
                        .filter(s => userSectorIds.includes(s.id))
                        .map(s => s.name);
                      
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium text-muted-foreground">
                            {member.profile?.name || 'Sem nome'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {member.role === 'admin' ? 'Admin' : 'Plantonista'}
                              </Badge>
                              {userSectorsNames.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  ({userSectorsNames.join(', ')})
                                </span>
                              )}
                            </div>
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
                      );
                    })
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

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Editar Usuário
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <form onSubmit={handleUpdateUser} className="space-y-6">
              {/* Personal Data */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <User className="h-4 w-4" />
                  Dados Pessoais
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="editName">Nome Completo *</Label>
                    <Input
                      id="editName"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nome do usuário"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editProfileType">Tipo de Perfil</Label>
                    <Select value={editProfileType} onValueChange={setEditProfileType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plantonista">Plantonista</SelectItem>
                        <SelectItem value="administrador">Administrador</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="editPhone">Telefone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="editPhone"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="pl-10"
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editCpf">CPF</Label>
                    <Input
                      id="editCpf"
                      value={editCpf}
                      onChange={(e) => setEditCpf(e.target.value)}
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="editCrm">CRM</Label>
                    <div className="relative">
                      <Stethoscope className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="editCrm"
                        value={editCrm}
                        onChange={(e) => setEditCrm(e.target.value)}
                        className="pl-10"
                        placeholder="CRM/SP 000000"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editAddress">Endereço</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="editAddress"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className="pl-10"
                        placeholder="Rua, número, cidade"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Bank Data */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CreditCard className="h-4 w-4" />
                  Dados Bancários
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="editBankName">Banco</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="editBankName"
                        value={editBankName}
                        onChange={(e) => setEditBankName(e.target.value)}
                        className="pl-10"
                        placeholder="Nome do banco"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editPixKey">Chave PIX</Label>
                    <Input
                      id="editPixKey"
                      value={editPixKey}
                      onChange={(e) => setEditPixKey(e.target.value)}
                      placeholder="CPF, email, telefone ou chave aleatória"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="editBankAgency">Agência</Label>
                    <Input
                      id="editBankAgency"
                      value={editBankAgency}
                      onChange={(e) => setEditBankAgency(e.target.value)}
                      placeholder="0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editBankAccount">Conta</Label>
                    <Input
                      id="editBankAccount"
                      value={editBankAccount}
                      onChange={(e) => setEditBankAccount(e.target.value)}
                      placeholder="00000-0"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Sectors */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Layers className="h-4 w-4" />
                  Setores que Participa
                </div>
                
                {sectors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum setor cadastrado. Crie setores primeiro.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sectors.map(sector => {
                      const isChecked = editSectorIds.includes(sector.id);
                      return (
                        <div 
                          key={sector.id}
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer"
                          style={{ borderLeftColor: sector.color || '#22c55e', borderLeftWidth: '4px' }}
                          onClick={() => {
                            if (isChecked) {
                              setEditSectorIds(editSectorIds.filter(id => id !== sector.id));
                            } else {
                              setEditSectorIds([...editSectorIds, sector.id]);
                            }
                          }}
                        >
                          <Checkbox
                            id={`sector-${sector.id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setEditSectorIds([...editSectorIds, sector.id]);
                              } else {
                                setEditSectorIds(editSectorIds.filter(id => id !== sector.id));
                              }
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: sector.color || '#22c55e' }}
                            />
                            <Label 
                              htmlFor={`sector-${sector.id}`} 
                              className="cursor-pointer font-medium"
                            >
                              {sector.name}
                            </Label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" disabled={isUpdatingUser}>
                  {isUpdatingUser ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
