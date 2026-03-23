import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { adminFeedback } from '@/lib/adminFeedback';
import { Plus, Pencil, Trash2, Users, Building2, Calendar, RefreshCw, MapPin, Clock, LocateFixed, ExternalLink } from 'lucide-react';

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
    full_name: string | null;
    profile_type: string | null;
  } | null;
}

interface SectorMembership {
  sector_id: string;
  user_id: string;
}

function parseCoordinateInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;

  const decimal = Number(normalized);
  if (Number.isFinite(decimal)) return decimal;

  const dmsMatch = normalized.match(
    /^\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)?\D*(\d+(?:\.\d+)?)?\D*([NSEWOL])?\s*$/i,
  );
  if (!dmsMatch) return null;

  const degrees = Number(dmsMatch[1] ?? 0);
  const minutes = Number(dmsMatch[2] ?? 0);
  const seconds = Number(dmsMatch[3] ?? 0);
  const direction = (dmsMatch[4] ?? '').toUpperCase();

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  let result = degrees + minutes / 60 + seconds / 3600;
  if (['S', 'W', 'O'].includes(direction)) {
    result *= -1;
  }

  return Number(result.toFixed(6));
}

function isValidLatitude(value: number | null): value is number {
  return value !== null && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return value !== null && value >= -180 && value <= 180;
}

export default function AdminSectors() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const notifySuccess = useCallback(
    (action: string, description?: string) => adminFeedback.success(toast, action, description),
    [toast],
  );
  const notifyInfo = useCallback(
    (title: string, description?: string) => adminFeedback.info(toast, title, description),
    [toast],
  );
  const notifyWarning = useCallback(
    (title: string, description?: string) => adminFeedback.warning(toast, title, description),
    [toast],
  );
  const notifyError = useCallback(
    (action: string, error?: unknown, fallback?: string) => adminFeedback.error(toast, action, error, fallback),
    [toast],
  );
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sectorMemberships, setSectorMemberships] = useState<SectorMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [checkinDialogOpen, setCheckinDialogOpen] = useState(false);
  const [selectedSectorForCheckin, setSelectedSectorForCheckin] = useState<Sector | null>(null);
  const [selectedConfigSectorId, setSelectedConfigSectorId] = useState<string>('');
  
  const [checkinSettings, setCheckinSettings] = useState({
    checkin_enabled: false,
    require_gps_checkin: false,
    allowed_checkin_radius_meters: 500,
    checkin_tolerance_minutes: 30,
    reference_latitude: null as number | null,
    reference_longitude: null as number | null,
  });
  const [capturingReferenceLocation, setCapturingReferenceLocation] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#22c55e',
  });

  const fetchData = useCallback(async () => {
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
        .select('user_id, role, profile:profiles!memberships_user_id_profiles_fkey(id, name, full_name, profile_type)')
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
  }, [currentTenantId]);

  useEffect(() => {
    if (currentTenantId) {
      fetchData();
    }
  }, [currentTenantId, fetchData]);

  useEffect(() => {
    if (!selectedConfigSectorId && sectors.length > 0) {
      setSelectedConfigSectorId(sectors[0].id);
    }
  }, [sectors, selectedConfigSectorId]);

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
        notifyError('atualizar setor', error, 'Não foi possível atualizar o setor.');
      } else {
        notifySuccess('Atualização de setor');
        fetchData();
        closeDialog();
      }
    } else {
      const { error } = await supabase
        .from('sectors')
        .insert({ ...sectorData, created_by: user?.id });

      if (error) {
        if (error.code === '23505') {
          notifyWarning('Nome já em uso', 'Já existe um setor com este nome.');
        } else {
          notifyError('criar setor', error, 'Não foi possível criar o setor.');
        }
      } else {
        notifySuccess('Cadastro de setor');
        fetchData();
        closeDialog();
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja excluir este setor? Os plantões vinculados perderão a referência.')) return;

    const { error } = await supabase.from('sectors').delete().eq('id', id);
    if (error) {
      notifyError('excluir setor', error, 'Não foi possível excluir o setor.');
    } else {
      notifySuccess('Exclusão de setor');
      fetchData();
    }
  }

  async function handleToggleActive(sector: Sector) {
    const { error } = await supabase
      .from('sectors')
      .update({ active: !sector.active, updated_by: user?.id })
      .eq('id', sector.id);

    if (error) {
      notifyError('atualizar status do setor', error, 'Não foi possível atualizar o status do setor.');
    } else {
      notifySuccess(sector.active ? 'Setor desativado' : 'Setor ativado');
      fetchData();
    }
  }

  async function makePlantonista(userId: string) {
    const { error } = await supabase
      .from('profiles')
      .update({ profile_type: 'plantonista' })
      .eq('id', userId);

    if (error) {
      notifyError('atualizar perfil', error, 'Não foi possível marcar o usuário como plantonista.');
      return;
    }

    notifySuccess('Perfil atualizado', 'Usuário marcado como plantonista.');
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
        notifyError('remover membros do setor', error, 'Não foi possível remover membros do setor.');
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
        notifyError('adicionar membros ao setor', error, 'Não foi possível adicionar membros ao setor.');
        return;
      }
    }

    notifySuccess('Atualização de membros');
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
      if (checkinSettings.reference_latitude === null || checkinSettings.reference_longitude === null) {
        notifyWarning('Coordenadas obrigatórias', 'Informe as coordenadas de referência para validação GPS.');
        return;
      }
      if (!isValidLatitude(checkinSettings.reference_latitude) || !isValidLongitude(checkinSettings.reference_longitude)) {
        notifyWarning(
          'Coordenadas inválidas',
          'Latitude deve ficar entre -90 e 90, e longitude entre -180 e 180.',
        );
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
      notifyError('salvar configurações de check-in', error, 'Não foi possível salvar as configurações de check-in.');
      return;
    }

    notifySuccess('Configurações de check-in');
    fetchData();
    setCheckinDialogOpen(false);
  }

  async function captureCurrentReferenceLocation() {
    if (!navigator.geolocation) {
      notifyError('capturar localização', 'GPS indisponível', 'Seu navegador não suporta geolocalização.');
      return;
    }

    setCapturingReferenceLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCheckinSettings((prev) => ({
          ...prev,
          reference_latitude: Number(position.coords.latitude.toFixed(6)),
          reference_longitude: Number(position.coords.longitude.toFixed(6)),
        }));
        setCapturingReferenceLocation(false);
        notifySuccess('Localização capturada', 'Coordenadas de referência preenchidas com sua posição atual.');
      },
      (error) => {
        setCapturingReferenceLocation(false);
        notifyError('capturar localização', error, 'Permita acesso à localização e tente novamente.');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  }

  const selectedConfigSector = sectors.find((s) => s.id === selectedConfigSectorId) || null;

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
    <div className="admin-page animate-fade-in">
      {/* Page Header */}
      <div className="page-header mb-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-2xl">Setores</h1>
          <p className="page-description mt-1">Gerencie os setores/unidades do hospital</p>
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

      {/* Dedicated card for GPS Check-ins */}
      <div className="grid gap-5">
        <Card className="card-elevated border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Check-ins GPS
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ative/desative e ajuste raio, tolerância e coordenadas por setor.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Setor</Label>
              <Select
                value={selectedConfigSectorId}
                onValueChange={setSelectedConfigSectorId}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/70 p-2">
                  {sectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => selectedConfigSector && openCheckinDialog(selectedConfigSector)}
                disabled={!selectedConfigSector}
              >
                <MapPin className="mr-1 h-4 w-4" />
                Configurar GPS
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/checkins')}>
                Ver relatórios
                <ExternalLink className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sectors List */}
      <Card className="admin-surface">
        <CardHeader className="admin-surface-header py-4">
          <CardTitle className="admin-surface-title flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Lista de Setores
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {sectors.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
              <Building2 className="mb-2 h-10 w-10 opacity-40" />
              <p>Nenhum setor cadastrado.</p>
              <p className="text-sm">Crie o primeiro setor para começar.</p>
            </div>
          ) : (
            sectors.map((sector) => (
              <div key={sector.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded-md border border-border"
                        style={{ backgroundColor: sector.color }}
                      />
                      <h3 className="truncate text-sm font-semibold text-foreground lg:text-base">{sector.name}</h3>
                    </div>
                    <p className="truncate text-xs text-muted-foreground lg:text-sm">{sector.description || '-'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-semibold">
                      <Users className="mr-1.5 h-3 w-3" />
                      {getMemberCount(sector.id)}
                    </Badge>
                    <Badge variant={sector.active ? 'success' : 'outline'}>
                      {sector.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => navigate(`/admin/calendar?sector=${sector.id}`)}
                  >
                    <Calendar className="mr-1 h-4 w-4" />
                    Escala
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => openMembersDialog(sector)}
                  >
                    <Users className="mr-1 h-4 w-4" />
                    Membros
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => openEdit(sector)}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => handleToggleActive(sector)}
                  >
                    {sector.active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-destructive"
                    onClick={() => handleDelete(sector.id)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            ))
          )}
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
                      notifyError('sincronizar membros do setor', error, 'Não foi possível sincronizar os membros.');
                      return;
                    }
                    
                    notifyInfo('Sincronização concluída', `${toRemove.length} membro(s) removido(s) por não serem plantonistas.`);
                    
                    fetchData();
                    setSelectedMembers(validMembers);
                  } else {
                    notifyInfo('Já sincronizado', 'Todos os membros do setor são plantonistas válidos.');
                  }
                }}
                title="Remover membros que não são plantonistas"
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                Sincronizar
              </Button>
            </div>
            <div className="max-h-[300px] overflow-y-auto rounded-md border bg-muted/10 p-3">
              {members
                .filter(m => (m.profile?.profile_type || '') === 'plantonista')
                .sort((a, b) => {
                  const nameA = (a.profile?.full_name || a.profile?.name || '').trim();
                  const nameB = (b.profile?.full_name || b.profile?.name || '').trim();
                  return nameA.localeCompare(nameB, 'pt-BR');
                })
                .map((member) => {
                  const displayName = (member.profile?.full_name || member.profile?.name || 'Sem nome').trim();
                  const checked = selectedMembers.includes(member.user_id);

                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      className={`mb-2 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                        checked
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'
                          : 'border-border bg-background hover:bg-muted/40'
                      }`}
                      onClick={() => {
                        const next = checked
                          ? selectedMembers.filter((id) => id !== member.user_id)
                          : [...selectedMembers, member.user_id];
                        setSelectedMembers(next);
                      }}
                    >
                      <Checkbox
                        id={`sector-member-${member.user_id}`}
                        checked={checked}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedMembers((prev) =>
                              prev.includes(member.user_id) ? prev : [...prev, member.user_id],
                            );
                          } else {
                            setSelectedMembers((prev) => prev.filter(id => id !== member.user_id));
                          }
                        }}
                      />
                      <Label htmlFor={`sector-member-${member.user_id}`} className="flex-1 cursor-pointer font-medium leading-tight">
                        {displayName}
                      </Label>
                      {checked && (
                        <Badge variant="secondary" className="text-xs">Membro</Badge>
                      )}
                    </button>
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
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={captureCurrentReferenceLocation}
                          disabled={capturingReferenceLocation}
                          className="gap-2"
                        >
                          <LocateFixed className="h-4 w-4" />
                          {capturingReferenceLocation ? 'Capturando...' : 'Usar minha localização atual'}
                        </Button>
                        {checkinSettings.reference_latitude !== null && checkinSettings.reference_longitude !== null && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() =>
                              window.open(
                                `https://www.google.com/maps?q=${checkinSettings.reference_latitude},${checkinSettings.reference_longitude}`,
                                '_blank',
                                'noopener,noreferrer',
                              )
                            }
                          >
                            <ExternalLink className="h-4 w-4" />
                            Ver no mapa
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Latitude</Label>
                          <Input
                            type="text"
                            placeholder="-23.550520"
                            value={checkinSettings.reference_latitude ?? ''}
                            onChange={(e) => 
                              setCheckinSettings({ 
                                ...checkinSettings, 
                                reference_latitude: parseCoordinateInput(e.target.value),
                              })
                            }
                          />
                          {checkinSettings.reference_latitude !== null && !isValidLatitude(checkinSettings.reference_latitude) && (
                            <p className="mt-1 text-[11px] text-destructive">Latitude inválida. Use um valor entre -90 e 90.</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Longitude</Label>
                          <Input
                            type="text"
                            placeholder="-46.633308"
                            value={checkinSettings.reference_longitude ?? ''}
                            onChange={(e) => 
                              setCheckinSettings({ 
                                ...checkinSettings, 
                                reference_longitude: parseCoordinateInput(e.target.value),
                              })
                            }
                          />
                          {checkinSettings.reference_longitude !== null && !isValidLongitude(checkinSettings.reference_longitude) && (
                            <p className="mt-1 text-[11px] text-destructive">Longitude inválida. Use um valor entre -180 e 180.</p>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Dica: aceitamos decimal (`-23.550520`) ou graus/minutos/segundos (`23° 56' 58.2" S`).
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
