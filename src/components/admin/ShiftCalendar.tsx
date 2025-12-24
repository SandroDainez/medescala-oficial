import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Plus, UserPlus, Trash2, Edit, Users } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO } from 'date-fns';
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
}

interface ShiftAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_value: number;
  status: string;
  profile: { name: string | null } | null;
}

interface Member {
  user_id: string;
  profile: { id: string; name: string | null } | null;
}

export default function ShiftCalendar() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [filterSector, setFilterSector] = useState<string>('all');
  
  // Dialogs
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  
  // Form data
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
      fetchData();
    }
  }, [currentTenantId, currentDate]);

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);

    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);

    const [shiftsRes, membersRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', format(start, 'yyyy-MM-dd'))
        .lte('shift_date', format(end, 'yyyy-MM-dd'))
        .order('shift_date', { ascending: true }),
      supabase
        .from('memberships')
        .select('user_id, profile:profiles!memberships_user_id_profiles_fkey(id, name)')
        .eq('tenant_id', currentTenantId)
        .eq('active', true),
    ]);

    if (shiftsRes.data) {
      setShifts(shiftsRes.data);
      
      // Fetch assignments for these shifts
      if (shiftsRes.data.length > 0) {
        const shiftIds = shiftsRes.data.map(s => s.id);
        const { data: assignmentsData } = await supabase
          .from('shift_assignments')
          .select('id, shift_id, user_id, assigned_value, status, profile:profiles!shift_assignments_user_id_profiles_fkey(name)')
          .in('shift_id', shiftIds);
        
        if (assignmentsData) {
          setAssignments(assignmentsData as unknown as ShiftAssignment[]);
        }
      }
    }

    if (membersRes.data) {
      setMembers(membersRes.data as unknown as Member[]);
    }

    setLoading(false);
  }

  // Get unique sectors
  const sectors = [...new Set(shifts.map(s => s.hospital))].filter(Boolean);

  // Filter shifts by sector
  const filteredShifts = filterSector === 'all' 
    ? shifts 
    : shifts.filter(s => s.hospital === filterSector);

  // Get shifts for a specific date
  function getShiftsForDate(date: Date) {
    return filteredShifts.filter(s => isSameDay(parseISO(s.shift_date), date));
  }

  // Get assignments for a shift
  function getAssignmentsForShift(shiftId: string) {
    return assignments.filter(a => a.shift_id === shiftId);
  }

  // Calendar navigation
  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  // Get day of week for first day of month (0-6, Sunday-Saturday)
  const firstDayOfWeek = startOfMonth(currentDate).getDay();

  // Create empty cells for days before the first day of month
  const emptyCells = Array(firstDayOfWeek).fill(null);

  async function handleCreateShift(e: React.FormEvent) {
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
      created_by: user?.id,
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
        fetchData();
        closeShiftDialog();
      }
    } else {
      const { error } = await supabase.from('shifts').insert(shiftData);

      if (error) {
        toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Plantão criado!' });
        fetchData();
        closeShiftDialog();
      }
    }
  }

  async function handleDeleteShift(id: string) {
    if (!confirm('Deseja excluir este plantão e todas as atribuições?')) return;

    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Plantão excluído!' });
      fetchData();
      setDayDialogOpen(false);
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
      created_by: user?.id,
    });

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Erro', description: 'Usuário já atribuído a este plantão', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao atribuir', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Usuário atribuído!' });
      fetchData();
      setAssignDialogOpen(false);
      setAssignData({ user_id: '', assigned_value: '' });
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!confirm('Deseja remover este usuário do plantão?')) return;

    const { error } = await supabase.from('shift_assignments').delete().eq('id', assignmentId);
    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Usuário removido do plantão!' });
      fetchData();
    }
  }

  function openCreateShift(date?: Date) {
    setEditingShift(null);
    setFormData({
      title: '',
      hospital: sectors[0] || '',
      location: '',
      shift_date: date ? format(date, 'yyyy-MM-dd') : '',
      start_time: '07:00',
      end_time: '19:00',
      base_value: '',
      notes: '',
    });
    setShiftDialogOpen(true);
  }

  function openEditShift(shift: Shift) {
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
    setShiftDialogOpen(true);
  }

  function closeShiftDialog() {
    setShiftDialogOpen(false);
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

  function openDayView(date: Date) {
    setSelectedDate(date);
    setDayDialogOpen(true);
  }

  function openAssignDialog(shift: Shift) {
    setSelectedShift(shift);
    setAssignData({ user_id: '', assigned_value: shift.base_value.toString() });
    setAssignDialogOpen(true);
  }

  if (loading) {
    return <div className="text-muted-foreground p-4">Carregando calendário...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with navigation and filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold min-w-[200px] text-center">
            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={filterSector} onValueChange={setFilterSector}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {sectors.map(sector => (
                <SelectItem key={sector} value={sector}>{sector}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => openCreateShift()}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Plantão
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {emptyCells.map((_, index) => (
              <div key={`empty-${index}`} className="min-h-[100px]" />
            ))}
            
            {days.map(day => {
              const dayShifts = getShiftsForDate(day);
              const hasShifts = dayShifts.length > 0;
              
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[100px] p-1 border rounded-lg cursor-pointer transition-colors
                    ${isToday(day) ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'}
                  `}
                  onClick={() => openDayView(day)}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                    {format(day, 'd')}
                  </div>
                  
                  {hasShifts && (
                    <div className="space-y-1">
                      {dayShifts.slice(0, 3).map(shift => {
                        const shiftAssignments = getAssignmentsForShift(shift.id);
                        return (
                          <div
                            key={shift.id}
                            className="text-xs p-1 rounded bg-primary/10 text-primary truncate"
                            title={`${shift.title} - ${shift.hospital}`}
                          >
                            <div className="font-medium truncate">{shift.hospital}</div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Users className="h-3 w-3" />
                              <span>{shiftAssignments.length}</span>
                            </div>
                          </div>
                        );
                      })}
                      {dayShifts.length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{dayShifts.length - 3} mais
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Dialog */}
      <Dialog open={dayDialogOpen} onOpenChange={setDayDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                {selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </span>
              <Button size="sm" onClick={() => selectedDate && openCreateShift(selectedDate)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Plantão
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {selectedDate && getShiftsForDate(selectedDate).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum plantão neste dia
              </p>
            ) : (
              selectedDate && getShiftsForDate(selectedDate).map(shift => {
                const shiftAssignments = getAssignmentsForShift(shift.id);
                return (
                  <Card key={shift.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{shift.title}</CardTitle>
                          <div className="text-sm text-muted-foreground">
                            {shift.hospital} {shift.location && `• ${shift.location}`}
                          </div>
                          <div className="text-sm">
                            {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)} • R$ {Number(shift.base_value).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openAssignDialog(shift)}>
                            <UserPlus className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditShift(shift)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteShift(shift.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Usuários Atribuídos:</div>
                        {shiftAssignments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum usuário atribuído</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {shiftAssignments.map(assignment => (
                              <Badge key={assignment.id} variant="secondary" className="flex items-center gap-2">
                                {assignment.profile?.name || 'Sem nome'}
                                <span className="text-xs text-muted-foreground">
                                  R$ {Number(assignment.assigned_value).toFixed(2)}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveAssignment(assignment.id);
                                  }}
                                  className="ml-1 hover:text-destructive"
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Shift Dialog */}
      <Dialog open={shiftDialogOpen} onOpenChange={(open) => !open && closeShiftDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Editar Plantão' : 'Novo Plantão'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateShift} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Plantão Noturno"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hospital">Setor/Hospital</Label>
                <Input
                  id="hospital"
                  value={formData.hospital}
                  onChange={(e) => setFormData({ ...formData, hospital: e.target.value })}
                  placeholder="Ex: UTI, PS, Centro Cirúrgico"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Local/Sala (opcional)</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Ex: Sala 3, Leito 12"
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
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observações adicionais..."
              />
            </div>
            <Button type="submit" className="w-full">
              {editingShift ? 'Salvar Alterações' : 'Criar Plantão'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign User Dialog */}
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
