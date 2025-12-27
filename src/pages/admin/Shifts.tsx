import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Shift {
  id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  base_value: number;
  notes: string | null;
  sector_id?: string | null;
  sector?: { name: string } | null;
}

interface ShiftAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  profile: { name: string | null } | null;
}

interface Member {
  user_id: string;
  profile: { id: string; name: string | null } | null;
}

export default function AdminShifts() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogCloseGuardRef = useRef(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    hospital: '',
    location: '',
    shift_date: '',
    start_time: '',
    end_time: '',
    base_value: '',
    notes: '',
  });

  const [assignData, setAssignData] = useState({
    user_id: '',
    assigned_value: '',
  });

  useEffect(() => {
    if (currentTenantId) {
      fetchShifts();
      fetchMembers();
    }
  }, [currentTenantId]);

  async function fetchShifts() {
    if (!currentTenantId) return;
    
    const { data, error } = await supabase
      .from('shifts')
      .select('id, title, hospital, location, shift_date, start_time, end_time, base_value, notes, sector_id, sector:sectors(name)')
      .eq('tenant_id', currentTenantId)
      .order('shift_date', { ascending: false });

    if (!error && data) {
      setShifts(data);
      
      // Fetch assignments for all shifts
      if (data.length > 0) {
        const shiftIds = data.map(s => s.id);
        const { data: assignmentsData } = await supabase
          .from('shift_assignments')
          .select('id, shift_id, user_id, profile:profiles!shift_assignments_user_id_profiles_fkey(name)')
          .in('shift_id', shiftIds);
        
        if (assignmentsData) {
          setAssignments(assignmentsData as unknown as ShiftAssignment[]);
        }
      } else {
        setAssignments([]);
      }
    }
    setLoading(false);
  }

  function getAssignmentsForShift(shiftId: string): ShiftAssignment[] {
    return assignments.filter(a => a.shift_id === shiftId);
  }

  async function fetchMembers() {
    if (!currentTenantId) return;
    
    const { data } = await supabase
      .from('memberships')
      .select('user_id, profile:profiles!memberships_user_id_profiles_fkey(id, name)')
      .eq('tenant_id', currentTenantId)
      .eq('active', true);
    
    if (data) setMembers(data as unknown as Member[]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTenantId) return;

    const shiftData = {
      tenant_id: currentTenantId,
      title: formData.title,
      hospital: formData.hospital,
      location: formData.location || null,
      shift_date: formData.shift_date,
      start_time: formData.start_time,
      end_time: formData.end_time,
      base_value: parseFloat(formData.base_value) || 0,
      notes: formData.notes || null,
      updated_by: user?.id,
    };

    if (editingShift) {
      const { error } = await supabase
        .from('shifts')
        .update(shiftData)
        .eq('id', editingShift.id);

      if (error) {
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Plantão atualizado!' });
        fetchShifts();
        closeDialog();
      }
    } else {
      const { error } = await supabase
        .from('shifts')
        .insert({ ...shiftData, created_by: user?.id });

      if (error) {
        toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Plantão criado!' });
        fetchShifts();
        closeDialog();
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja excluir este plantão?')) return;

    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Plantão excluído!' });
      fetchShifts();
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedShift || !currentTenantId) return;

    const { error } = await supabase.from('shift_assignments').insert({
      tenant_id: currentTenantId,
      shift_id: selectedShift.id,
      user_id: assignData.user_id,
      assigned_value: parseFloat(assignData.assigned_value) || selectedShift.base_value,
    });

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Erro', description: 'Usuário já atribuído a este plantão', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao atribuir', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Usuário atribuído!' });
      setAssignDialogOpen(false);
      setAssignData({ user_id: '', assigned_value: '' });
    }
  }

  function openEdit(shift: Shift) {
    if (dialogCloseGuardRef.current) return;

    setEditingShift(shift);
    setFormData({
      title: shift.title,
      hospital: shift.hospital,
      location: shift.location || '',
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      base_value: shift.base_value.toString(),
      notes: shift.notes || '',
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    // Guard against immediate reopen caused by click-through/focus quirks
    dialogCloseGuardRef.current = true;
    window.setTimeout(() => {
      dialogCloseGuardRef.current = false;
    }, 300);

    setDialogOpen(false);
    setEditingShift(null);
    setFormData({
      title: '',
      hospital: '',
      location: '',
      shift_date: '',
      start_time: '',
      end_time: '',
      base_value: '',
      notes: '',
    });
  }

  if (loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Plantões</h2>
          <p className="text-muted-foreground">Gerencie os plantões do hospital</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          } else {
            setDialogOpen(true);
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              if (dialogCloseGuardRef.current) return;
              setEditingShift(null);
              setFormData({
                title: '',
                hospital: '',
                location: '',
                shift_date: '',
                start_time: '',
                end_time: '',
                base_value: '',
                notes: '',
              });
              setDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Plantão
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingShift ? 'Editar Plantão' : 'Novo Plantão'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Título</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hospital">Hospital/Setor</Label>
                  <Input
                    id="hospital"
                    value={formData.hospital}
                    onChange={(e) => setFormData({ ...formData, hospital: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Local/Sala</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="shift_date">Data</Label>
                  <Input
                    id="shift_date"
                    type="date"
                    value={formData.shift_date}
                    onChange={(e) => setFormData({ ...formData, shift_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start_time">Início</Label>
                  <Input
                    id="start_time"
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_time">Fim</Label>
                  <Input
                    id="end_time"
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="base_value">Valor Base (R$)</Label>
                <Input
                  id="base_value"
                  type="number"
                  step="0.01"
                  value={formData.base_value}
                  onChange={(e) => setFormData({ ...formData, base_value: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">
                {editingShift ? 'Salvar Alterações' : 'Criar Plantão'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Plantonista</TableHead>
                <TableHead>Horário</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum plantão cadastrado
                  </TableCell>
                </TableRow>
              ) : (
                shifts.map((shift) => {
                  const shiftAssignments = getAssignmentsForShift(shift.id);
                  return (
                    <TableRow key={shift.id}>
                      <TableCell>
                        {format(new Date(shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">{shift.title}</TableCell>
                      <TableCell>{shift.sector?.name ?? 'Sem Setor'}</TableCell>
                      <TableCell>
                        {shiftAssignments.length > 0 ? (
                          <span className="text-foreground">
                            {shiftAssignments.map(a => a.profile?.name || 'Sem nome').join(', ')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">Vago</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                      </TableCell>
                      <TableCell>R$ {Number(shift.base_value).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedShift(shift);
                            setAssignData({ ...assignData, assigned_value: shift.base_value.toString() });
                            setAssignDialogOpen(true);
                          }}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(shift)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(shift.id)}>
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

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Usuário ao Plantão</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4">
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={assignData.user_id} onValueChange={(v) => setAssignData({ ...assignData, user_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.name || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_value">Valor Atribuído (R$)</Label>
              <Input
                id="assigned_value"
                type="number"
                step="0.01"
                value={assignData.assigned_value}
                onChange={(e) => setAssignData({ ...assignData, assigned_value: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={!assignData.user_id}>
              Atribuir
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
