import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Users, Building2 } from 'lucide-react';

interface Sector {
  id: string;
  name: string;
  description: string | null;
  color: string;
  active: boolean;
}

interface Member {
  user_id: string;
  profile: { id: string; name: string | null } | null;
}

interface SectorMembership {
  sector_id: string;
  user_id: string;
}

export default function AdminSectors() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sectorMemberships, setSectorMemberships] = useState<SectorMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

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
        .select('user_id, profile:profiles!memberships_user_id_profiles_fkey(id, name)')
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

  function openMembersDialog(sector: Sector) {
    setSelectedSector(sector);
    const currentMembers = sectorMemberships
      .filter(sm => sm.sector_id === sector.id)
      .map(sm => sm.user_id);
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

  if (loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Setores</h2>
          <p className="text-muted-foreground">Gerencie os setores/unidades do hospital</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
          <DialogTrigger asChild>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Setor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSector ? 'Editar Setor' : 'Novo Setor'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Setor</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: UTI, PS, Centro Cirúrgico"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição do setor"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Cor</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="h-10 w-20 cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">{formData.color}</span>
                </div>
              </div>
              <Button type="submit" className="w-full">
                {editingSector ? 'Salvar Alterações' : 'Criar Setor'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Setores</CardTitle>
            <Building2 className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sectors.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Setores Ativos</CardTitle>
            <Building2 className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sectors.filter(s => s.active).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Atribuições</CardTitle>
            <Users className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sectorMemberships.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sectors Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cor</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Membros</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum setor cadastrado. Crie o primeiro setor para começar.
                  </TableCell>
                </TableRow>
              ) : (
                sectors.map((sector) => (
                  <TableRow key={sector.id}>
                    <TableCell>
                      <div
                        className="h-6 w-6 rounded-full"
                        style={{ backgroundColor: sector.color }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{sector.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {sector.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        <Users className="mr-1 h-3 w-3" />
                        {getMemberCount(sector.id)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={sector.active ? 'default' : 'outline'}>
                        {sector.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
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
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Membros do Setor: {selectedSector?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione os plantonistas que fazem parte deste setor:
            </p>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center space-x-3 p-2 rounded hover:bg-accent"
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
                  <Label htmlFor={member.user_id} className="cursor-pointer flex-1">
                    {member.profile?.name || 'Sem nome'}
                  </Label>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <span className="text-sm text-muted-foreground">
                {selectedMembers.length} selecionado(s)
              </span>
              <Button onClick={saveSectorMembers}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
