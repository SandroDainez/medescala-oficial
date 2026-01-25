import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Users, Building2, Calendar, DollarSign, UserCog, RefreshCw, MapPin, Clock } from 'lucide-react';
import SectorValuesDialog from '@/components/admin/SectorValuesDialog';
import UserSectorValuesDialog from '@/components/admin/UserSectorValuesDialog';

interface Sector {
  id: string;
  name: string;
  description: string | null;
  color: string;
  active: boolean;
  default_day_value?: number | null;
  default_night_value?: number | null;
  checkin_enabled?: boolean;
  require_gps_checkin?: boolean;
  allowed_checkin_radius_meters?: number | null;
  checkin_tolerance_minutes?: number;
  reference_latitude?: number | null;
  reference_longitude?: number | null;
}

interface Member {
  user_id: string;
  role: 'admin' | 'user';
  profile: {
    id: string;
    name: string | null;
    profile_type: string | null;
  } | null;
}

interface SectorMembership {
  sector_id: string;
  user_id: string;
}

export default function AdminSectors() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sectorMemberships, setSectorMemberships] = useState<SectorMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [valuesDialogOpen, setValuesDialogOpen] = useState(false);
  const [userValuesDialogOpen, setUserValuesDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null);
  const [selectedSectorForValues, setSelectedSectorForValues] = useState<Sector | null>(null);
  const [selectedSectorForUserValues, setSelectedSectorForUserValues] = useState<Sector | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [checkinDialogOpen, setCheckinDialogOpen] = useState(false);
  const [selectedSectorForCheckin, setSelectedSectorForCheckin] = useState<Sector | null>(null);
  
  // Month/Year for individual values dialog
  const [userValuesMonth, setUserValuesMonth] = useState<number>(new Date().getMonth() + 1);
  const [userValuesYear, setUserValuesYear] = useState<number>(new Date().getFullYear());
  
  const [checkinSettings, setCheckinSettings] = useState({
    checkin_enabled: false,
    require_gps_checkin: false,
    allowed_checkin_radius_meters: 500,
    checkin_tolerance_minutes: 30,
    reference_latitude: null as number | null,
    reference_longitude: null as number | null,
  });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#22c55e',
  });

  useEffect(() => {
    if (currentTenantId) {
      fetchData();
    }
  }, [currentTenantId]);

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);

    const [sectorsRes, membersRes, membershipRes] = await Promise.all([
      supabase
        .from('sectors')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .order('name'),
      supabase
        .from('memberships')
        .select('user_id, role, profile:profiles!memberships_user_id_profiles_fkey(id, name, profile_type)')
        .eq('tenant_id', currentTenantId)
        .eq('active', true),
      supabase
        .from('sector_memberships')
        .select('sector_id, user_id')
        .eq('tenant_id', currentTenantId),
    ]);

    if (sectorsRes.data) setSectors(sectorsRes.data);
    if (membersRes.data) setMembers(membersRes.data as unknown as Member[]);
    if (membershipRes.data) setSectorMemberships(membershipRes.data);
    
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTenantId) return;

    const sectorData = {
      tenant_id: currentTenantId,
      name: formData.name,
      description: formData.description || null,
      color: formData.color,
      updated_by: user?.id,
    };

    if (editingSector) {
      const { error } = await supabase
        .from('sectors')
        .update(sectorData)
        .eq('id', editingSector.id);

      if (error) {
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Setor atualizado!' });
        fetchData();
        closeDialog();
      }
    } else {
      const { error } = await supabase
        .from('sectors')
        .insert({ ...sectorData, created_by: user?.id });

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Erro', description: 'Já existe um setor com este nome', variant: 'destructive' });
        } else {
          toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
        }
      } else {
        toast({ title: 'Setor criado!' });
        fetchData();
        closeDialog();
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja excluir este setor? Os plantões vinculados perderão a referência.')) return;

    const { error } = await supabase.from('sectors').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Setor excluído!' });
      fetchData();
    }
  }

  async function handleToggleActive(sector: Sector) {
    const { error } = await supabase
      .from('sectors')
      .update({ active: !sector.active, updated_by: user?.id })
      .eq('id', sector.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: sector.active ? 'Setor desativado' : 'Setor ativado' });
      fetchData();
    }
  }

  async function makePlantonista(userId: string) {
    const { error } = await supabase
      .from('profiles')
      .update({ profile_type: 'plantonista' })
      .eq('id', userId);

    if (error) {
      toast({ title: 'Erro ao tornar plantonista', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Perfil atualizado', description: 'Usuário marcado como plantonista.' });
    fetchData();
  }

  function openMembersDialog(sector: Sector) {
    setSelectedSector(sector);
    const plantonistasSet = new Set(
      members
        .filter((m) => (m.profile?.profile_type || '') === 'plantonista')
        .map((m) => m.user_id),
    );

    const currentMembers = sectorMemberships
      .filter(sm => sm.sector_id === sector.id)
      .map(sm => sm.user_id)
      .filter((userId) => plantonistasSet.has(userId));

    setSelectedMembers(currentMembers);
    setMembersDialogOpen(true);
  }

  async function saveSectorMembers() {
    if (!selectedSector || !currentTenantId) return;

    // Get current memberships for this sector
    const currentMemberships = sectorMemberships.filter(sm => sm.sector_id === selectedSector.id);
    const currentUserIds = currentMemberships.map(sm => sm.user_id);

    // Find users to add and remove
    const toAdd = selectedMembers.filter(id => !currentUserIds.includes(id));
    const toRemove = currentUserIds.filter(id => !selectedMembers.includes(id));

    // Remove memberships
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('sector_memberships')
        .delete()
        .eq('sector_id', selectedSector.id)
        .in('user_id', toRemove);
      
      if (error) {
        toast({ title: 'Erro ao remover membros', description: error.message, variant: 'destructive' });
        return;
      }
    }

    // Add memberships
    if (toAdd.length > 0) {
      const newMemberships = toAdd.map(userId => ({
        sector_id: selectedSector.id,
        user_id: userId,
        tenant_id: currentTenantId,
        created_by: user?.id,
      }));

      const { error } = await supabase
        .from('sector_memberships')
        .insert(newMemberships);

      if (error) {
        toast({ title: 'Erro ao adicionar membros', description: error.message, variant: 'destructive' });
        return;
      }
    }

    toast({ title: 'Membros atualizados!' });
    fetchData();
    setMembersDialogOpen(false);
  }

  function openEdit(sector: Sector) {
    setEditingSector(sector);
    setFormData({
      name: sector.name,
      description: sector.description || '',
      color: sector.color,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingSector(null);
    setFormData({ name: '', description: '', color: '#22c55e' });
  }

  function getMemberCount(sectorId: string) {
    return sectorMemberships.filter(sm => sm.sector_id === sectorId).length;
  }

  function openValuesDialog(sector: Sector) {
    setSelectedSectorForValues(sector);
    setValuesDialogOpen(true);
  }

  function openUserValuesDialog(sector: Sector) {
    setSelectedSectorForUserValues(sector);
    setUserValuesDialogOpen(true);
  }

  function openCheckinDialog(sector: Sector) {
    setSelectedSectorForCheckin(sector);
    setCheckinSettings({
      checkin_enabled: sector.checkin_enabled || false,
      require_gps_checkin: sector.require_gps_checkin || false,
      allowed_checkin_radius_meters: sector.allowed_checkin_radius_meters || 500,
      checkin_tolerance_minutes: sector.checkin_tolerance_minutes || 30,
      reference_latitude: sector.reference_latitude ?? null,
      reference_longitude: sector.reference_longitude ?? null,
    });
    setCheckinDialogOpen(true);
  }

  async function saveCheckinSettings() {
    if (!selectedSectorForCheckin) return;

    // Validate coordinates if GPS is required
    if (checkinSettings.require_gps_checkin) {
      if (!checkinSettings.reference_latitude || !checkinSettings.reference_longitude) {
        toast({ 
          title: 'Erro', 
          description: 'Informe as coordenadas de referência para validação GPS.', 
          variant: 'destructive' 
        });
        return;
      }
    }

    const { error } = await supabase
      .from('sectors')
      .update({
        checkin_enabled: checkinSettings.checkin_enabled,
        require_gps_checkin: checkinSettings.require_gps_checkin,
        allowed_checkin_radius_meters: checkinSettings.allowed_checkin_radius_meters,
        checkin_tolerance_minutes: checkinSettings.checkin_tolerance_minutes,
        reference_latitude: checkinSettings.reference_latitude,
        reference_longitude: checkinSettings.reference_longitude,
        updated_by: user?.id,
      })
      .eq('id', selectedSectorForCheckin.id);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Configurações de check-in salvas!' });
    fetchData();
    setCheckinDialogOpen(false);
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          <span className="text-muted-foreground">Carregando setores...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/60">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Setores</h1>
          <p className="text-muted-foreground mt-1">Gerencie os setores/unidades do hospital</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
          <DialogTrigger asChild>
            <Button onClick={() => setDialogOpen(true)} size="lg" className="shadow-primary">
              <Plus className="mr-2 h-5 w-5" />
              Novo Setor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-xl">{editingSector ? 'Editar Setor' : 'Novo Setor'}</DialogTitle>
              <DialogDescription>
                {editingSector ? 'Atualize as informações do setor' : 'Adicione um novo setor ao hospital'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Nome do Setor</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: UTI, PS, Centro Cirúrgico"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">Descrição (opcional)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição do setor"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color" className="text-sm font-medium">Cor do Setor</Label>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Input
                      id="color"
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="h-12 w-16 cursor-pointer p-1 rounded-xl"
                    />
                  </div>
                  <div 
                    className="h-10 px-4 rounded-lg flex items-center text-sm font-medium text-white"
                    style={{ backgroundColor: formData.color }}
                  >
                    {formData.name || 'Preview'}
                  </div>
                </div>
              </div>
            </form>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button type="submit" onClick={handleSubmit}>
                {editingSector ? 'Salvar Alterações' : 'Criar Setor'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="stat-card group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Setores</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{sectors.length}</div>
            <p className="text-xs text-muted-foreground mt-1">setores cadastrados</p>
          </CardContent>
        </Card>
        <Card className="stat-card group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Setores Ativos</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-success-light flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{sectors.filter(s => s.active).length}</div>
            <p className="text-xs text-muted-foreground mt-1">em operação</p>
          </CardContent>
        </Card>
        <Card className="stat-card group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Atribuições</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-info-light flex items-center justify-center group-hover:bg-info/20 transition-colors">
              <Users className="h-5 w-5 text-info" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{sectorMemberships.length}</div>
            <p className="text-xs text-muted-foreground mt-1">membros em setores</p>
          </CardContent>
        </Card>
      </div>

      {/* Month/Year Selector for Individual Values */}
      <Card className="p-4 border-border/60">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Mês/Ano para Valores Individuais:</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={userValuesMonth}
              onChange={(e) => setUserValuesMonth(Number(e.target.value))}
              className="px-3 py-1.5 text-sm border rounded-md bg-background"
            >
              <option value={1}>Janeiro</option>
              <option value={2}>Fevereiro</option>
              <option value={3}>Março</option>
              <option value={4}>Abril</option>
              <option value={5}>Maio</option>
              <option value={6}>Junho</option>
              <option value={7}>Julho</option>
              <option value={8}>Agosto</option>
              <option value={9}>Setembro</option>
              <option value={10}>Outubro</option>
              <option value={11}>Novembro</option>
              <option value={12}>Dezembro</option>
            </select>
            <select
              value={userValuesYear}
              onChange={(e) => setUserValuesYear(Number(e.target.value))}
              className="px-3 py-1.5 text-sm border rounded-md bg-background"
            >
              {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-muted-foreground">
            Os valores individuais editados valem apenas para o mês/ano selecionado.
          </span>
        </div>
      </Card>

      {/* Sectors Table */}
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="bg-muted/30 border-b border-border/60 py-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Lista de Setores
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Cor</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Descrição</TableHead>
                <TableHead>Valores</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Membros</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Building2 className="h-10 w-10 mb-2 opacity-40" />
                      <p>Nenhum setor cadastrado.</p>
                      <p className="text-sm">Crie o primeiro setor para começar.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sectors.map((sector, index) => (
                  <TableRow key={sector.id} className="group" style={{ animationDelay: `${index * 50}ms` }}>
                    <TableCell>
                      <div
                        className="h-8 w-8 rounded-lg shadow-sm border-2 border-white"
                        style={{ backgroundColor: sector.color }}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-foreground">{sector.name}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground max-w-[200px] truncate">
                      {sector.description || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="w-4 h-4 rounded bg-warning-light flex items-center justify-center text-warning font-bold">D</span>
                          <span className="font-medium">{formatCurrency(sector.default_day_value)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="w-4 h-4 rounded bg-info-light flex items-center justify-center text-info font-bold">N</span>
                          <span className="font-medium">{formatCurrency(sector.default_night_value)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => openCheckinDialog(sector)}
                        className="flex flex-col gap-1 hover:opacity-80 transition-opacity cursor-pointer"
                        title="Clique para configurar check-in e GPS"
                      >
                        <Badge 
                          variant={sector.checkin_enabled ? 'success' : 'secondary'}
                        >
                          {sector.checkin_enabled ? 'Ativo' : 'Inativo'}
                        </Badge>
                        {sector.checkin_enabled && sector.require_gps_checkin && (
                          <Badge variant="info" className="text-xs">
                            <MapPin className="mr-1 h-3 w-3" />
                            {sector.allowed_checkin_radius_meters || 500}m
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-semibold">
                        <Users className="mr-1.5 h-3 w-3" />
                        {getMemberCount(sector.id)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={sector.active ? 'success' : 'outline'}>
                        {sector.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openValuesDialog(sector)}
                          title="Configurar valores"
                        >
                          <DollarSign className="mr-1 h-4 w-4" />
                          Valores
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openUserValuesDialog(sector)}
                          title="Valores individuais por plantonista"
                        >
                          <UserCog className="mr-1 h-4 w-4" />
                          Individual
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/calendar?sector=${sector.id}`)}
                        >
                          <Calendar className="mr-1 h-4 w-4" />
                          Escala
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMembersDialog(sector)}
                        >
                          <Users className="mr-1 h-4 w-4" />
                          Membros
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(sector)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(sector)}
                        >
                          {sector.active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(sector.id)}>
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

      {/* Members Assignment Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Membros do Setor: {selectedSector?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Selecione os plantonistas que fazem parte deste setor:
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!selectedSector || !currentTenantId) return;
                  
                  // Get all plantonistas from the tenant
                  const plantonistasInTenant = members
                    .filter(m => (m.profile?.profile_type || '') === 'plantonista')
                    .map(m => m.user_id);
                  
                  // Current sector members
                  const currentSectorMembers = sectorMemberships
                    .filter(sm => sm.sector_id === selectedSector.id)
                    .map(sm => sm.user_id);
                  
                  // Keep only those who are still plantonistas
                  const validMembers = currentSectorMembers.filter(id => 
                    plantonistasInTenant.includes(id)
                  );
                  
                  // Remove invalid members (those who are no longer plantonistas)
                  const toRemove = currentSectorMembers.filter(id => 
                    !plantonistasInTenant.includes(id)
                  );
                  
                  if (toRemove.length > 0) {
                    const { error } = await supabase
                      .from('sector_memberships')
                      .delete()
                      .eq('sector_id', selectedSector.id)
                      .eq('tenant_id', currentTenantId)
                      .in('user_id', toRemove);
                    
                    if (error) {
                      toast({ 
                        title: 'Erro ao sincronizar', 
                        description: error.message, 
                        variant: 'destructive' 
                      });
                      return;
                    }
                    
                    toast({ 
                      title: 'Sincronização concluída', 
                      description: `${toRemove.length} membro(s) removido(s) por não serem plantonistas.` 
                    });
                    
                    fetchData();
                    setSelectedMembers(validMembers);
                  } else {
                    toast({ 
                      title: 'Já sincronizado', 
                      description: 'Todos os membros do setor são plantonistas válidos.' 
                    });
                  }
                }}
                title="Remover membros que não são plantonistas"
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                Sincronizar
              </Button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-lg p-2">
              {members
                .filter(m => (m.profile?.profile_type || '') === 'plantonista')
                .sort((a, b) => (a.profile?.name || '').localeCompare(b.profile?.name || '', 'pt-BR'))
                .map((member) => {
                  const displayName = member.profile?.name || 'Sem nome';

                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-accent cursor-pointer"
                      onClick={() => {
                        const next = selectedMembers.includes(member.user_id)
                          ? selectedMembers.filter((id) => id !== member.user_id)
                          : [...selectedMembers, member.user_id];
                        setSelectedMembers(next);
                      }}
                    >
                      <Checkbox
                        id={member.user_id}
                        checked={selectedMembers.includes(member.user_id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedMembers([...selectedMembers, member.user_id]);
                          } else {
                            setSelectedMembers(selectedMembers.filter(id => id !== member.user_id));
                          }
                        }}
                      />
                      <span className="flex-1">{displayName}</span>
                      {selectedMembers.includes(member.user_id) && (
                        <Badge variant="secondary" className="text-xs">Membro</Badge>
                      )}
                    </div>
                  );
                })}
            </div>
            <div className="flex justify-between pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                {selectedMembers.length} selecionado(s)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMembersDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={saveSectorMembers}>
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sector Values Dialog */}
      <SectorValuesDialog
        open={valuesDialogOpen}
        onOpenChange={setValuesDialogOpen}
        sector={selectedSectorForValues}
        tenantId={currentTenantId || ''}
        userId={user?.id}
        onSuccess={fetchData}
      />

      {/* Individual User Sector Values Dialog */}
      <UserSectorValuesDialog
        open={userValuesDialogOpen}
        onOpenChange={setUserValuesDialogOpen}
        sector={selectedSectorForUserValues}
        tenantId={currentTenantId || ''}
        userId={user?.id}
        month={userValuesMonth}
        year={userValuesYear}
        onSuccess={fetchData}
      />

      {/* Check-in Configuration Dialog */}
      <Dialog open={checkinDialogOpen} onOpenChange={setCheckinDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Configurar Check-in: {selectedSectorForCheckin?.name}
            </DialogTitle>
            <DialogDescription>
              Configure como os plantonistas confirmam presença nos plantões deste setor.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
            {/* Enable Check-in */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Habilitar Check-in</Label>
                <p className="text-sm text-muted-foreground">
                  Plantonistas precisam confirmar presença
                </p>
              </div>
              <Switch
                checked={checkinSettings.checkin_enabled}
                onCheckedChange={(checked) => 
                  setCheckinSettings({ ...checkinSettings, checkin_enabled: checked })
                }
              />
            </div>

            {checkinSettings.checkin_enabled && (
              <>
                {/* Tolerance */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Tolerância (minutos)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Tempo antes/depois do horário permitido para check-in
                  </p>
                  <Input
                    type="number"
                    min={5}
                    max={120}
                    value={checkinSettings.checkin_tolerance_minutes}
                    onChange={(e) => 
                      setCheckinSettings({ 
                        ...checkinSettings, 
                        checkin_tolerance_minutes: parseInt(e.target.value) || 30 
                      })
                    }
                  />
                </div>

                {/* Require GPS */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Exigir GPS
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Validar localização do plantonista
                    </p>
                  </div>
                  <Switch
                    checked={checkinSettings.require_gps_checkin}
                    onCheckedChange={(checked) => 
                      setCheckinSettings({ ...checkinSettings, require_gps_checkin: checked })
                    }
                  />
                </div>

                {checkinSettings.require_gps_checkin && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Raio permitido (metros)</Label>
                      <p className="text-xs text-muted-foreground">
                        Distância máxima do local de trabalho para aceitar o check-in
                      </p>
                      <Input
                        type="number"
                        min={50}
                        max={5000}
                        step={50}
                        value={checkinSettings.allowed_checkin_radius_meters}
                        onChange={(e) => 
                          setCheckinSettings({ 
                            ...checkinSettings, 
                            allowed_checkin_radius_meters: parseInt(e.target.value) || 500 
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Recomendado: 500m para hospitais grandes, 200m para clínicas
                      </p>
                    </div>

                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
                      <Label className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        Localização de Referência
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Coordenadas do local de trabalho (obrigatório para validação GPS)
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Latitude</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            placeholder="-23.550520"
                            value={checkinSettings.reference_latitude ?? ''}
                            onChange={(e) => 
                              setCheckinSettings({ 
                                ...checkinSettings, 
                                reference_latitude: e.target.value ? parseFloat(e.target.value) : null 
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Longitude</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            placeholder="-46.633308"
                            value={checkinSettings.reference_longitude ?? ''}
                            onChange={(e) => 
                              setCheckinSettings({ 
                                ...checkinSettings, 
                                reference_longitude: e.target.value ? parseFloat(e.target.value) : null 
                              })
                            }
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Dica: Pesquise no Google Maps o endereço e copie as coordenadas da URL
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setCheckinDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCheckinSettings}>
              Salvar Configurações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
