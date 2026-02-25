import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { clearPwaCacheAndReload } from '@/lib/pwa';
import { 
  Bell, Send, Users, Calendar, DollarSign, ArrowLeftRight, 
  AlertCircle, CheckCircle, Plus, Trash2, Eye, Pencil, MoreVertical, RefreshCw
} from 'lucide-react';
import { format, parseISO, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Member {
  user_id: string;
  name: string;
  role: string;
  profile_type?: string | null;
}

interface SentNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  user_id: string;
  user_name?: string;
}

interface AvailableShift {
  id: string;
  title: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_id: string | null;
  sector_name: string;
  base_value: number | null;
}

interface Sector {
  id: string;
  name: string;
}

const notificationTypes = [
  { value: 'shift', label: 'Plantão Disponível', icon: Calendar, color: 'text-blue-500' },
  { value: 'payment', label: 'Pagamento', icon: DollarSign, color: 'text-green-500' },
  { value: 'swap', label: 'Troca de Plantão', icon: ArrowLeftRight, color: 'text-purple-500' },
  { value: 'urgent', label: 'Urgente', icon: AlertCircle, color: 'text-red-500' },
  { value: 'general', label: 'Geral', icon: Bell, color: 'text-muted-foreground' },
];

export default function AdminNotifications() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sentNotifications, setSentNotifications] = useState<SentNotification[]>([]);
  const [availableShifts, setAvailableShifts] = useState<AvailableShift[]>([]);
  const [memberSectorMap, setMemberSectorMap] = useState<Record<string, string[]>>({});
  
  // Multi-select state for history tab
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  
  // Form state
  const [notificationType, setNotificationType] = useState('general');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(true);
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('all');
  
  // Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingNotification, setEditingNotification] = useState<SentNotification | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMessage, setEditMessage] = useState('');

  const fetchData = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);

    // Fetch members
    const { data: membersData } = await supabase
      .from('memberships')
      .select('user_id, role, profile:profiles!memberships_user_id_profiles_fkey(name, full_name, profile_type)')
      .eq('tenant_id', currentTenantId)
      .eq('active', true);

    if (membersData) {
      setMembers(membersData.map(m => ({
        // Sempre prioriza nome completo quando existir
        user_id: m.user_id,
        name: (m.profile as any)?.full_name?.trim() || (m.profile as any)?.name || 'Sem nome',
        role: m.role,
        profile_type: (m.profile as any)?.profile_type ?? null,
      })));
    }

    const [{ data: sectorsData }, { data: sectorMembershipsData }] = await Promise.all([
      supabase
        .from('sectors')
        .select('id, name')
        .eq('tenant_id', currentTenantId)
        .eq('active', true)
        .order('name'),
      supabase
        .from('sector_memberships')
        .select('user_id, sector_id')
        .eq('tenant_id', currentTenantId),
    ]);

    if (sectorsData) {
      setSectors(sectorsData);
    }

    const map: Record<string, string[]> = {};
    (sectorMembershipsData || []).forEach((row: { user_id: string; sector_id: string }) => {
      if (!map[row.user_id]) map[row.user_id] = [];
      map[row.user_id].push(row.sector_id);
    });
    setMemberSectorMap(map);

    // Fetch recent sent notifications
    const { data: notifsData } = await supabase
      .from('notifications')
      .select('*')
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (notifsData) {
      // Get user names for the notifications
      const userIds = [...new Set(notifsData.map(n => n.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, name')
        .in('id', userIds);

      const profileMap = new Map(
        (profilesData || []).map((p: any) => [p.id, p.full_name?.trim() || p.name || 'Desconhecido'])
      );
      
      setSentNotifications(notifsData.map(n => ({
        ...n,
        user_name: profileMap.get(n.user_id) || 'Desconhecido',
      })));
    }

    // Fetch available shifts (without assignments) using get_shift_roster
    const today = new Date().toISOString().split('T')[0];
    const endDate = format(new Date(new Date().setMonth(new Date().getMonth() + 12)), 'yyyy-MM-dd');
    
    const { data: shiftsData } = await supabase
      .from('shifts')
      .select(`
        id, title, shift_date, start_time, end_time, base_value, sector_id,
        sector:sectors(name)
      `)
      .eq('tenant_id', currentTenantId)
      .gte('shift_date', today)
      .order('shift_date', { ascending: true });

    if (shiftsData) {
      // Get taken shifts via security-definer function
      const { data: rosterData } = await supabase.rpc('get_shift_roster', {
        _tenant_id: currentTenantId,
        _start: today,
        _end: endDate,
      });

      const takenShiftIds = new Set((rosterData || []).map((r: { shift_id: string }) => r.shift_id));
      
      const available = shiftsData
        .filter(s => !takenShiftIds.has(s.id))
        .map(s => ({
          id: s.id,
          title: s.title,
          shift_date: s.shift_date,
          start_time: s.start_time,
          end_time: s.end_time,
          sector_id: (s as any).sector_id ?? null,
          sector_name: (s.sector as any)?.name || 'Sem setor',
          base_value: s.base_value,
        }));

      setAvailableShifts(available);
    }

    setLoading(false);
  }, [currentTenantId]);

  function handleTypeChange(type: string) {
    setNotificationType(type);
    
    // Auto-fill templates based on type
    switch (type) {
      case 'shift':
        setTitle('Plantão Disponível');
        setMessage('Há um plantão disponível que pode ser do seu interesse. Acesse o app para mais detalhes.');
        break;
      case 'payment':
        setTitle('Pagamento Processado');
        setMessage('Seu pagamento foi processado. Verifique seu extrato financeiro no aplicativo.');
        break;
      case 'swap':
        setTitle('Nova Solicitação de Troca');
        setMessage('Você recebeu uma nova solicitação de troca de plantão.');
        break;
      case 'urgent':
        setTitle('Aviso Urgente');
        setMessage('');
        break;
      default:
        setTitle('');
        setMessage('');
    }
  }
  useEffect(() => {
    if (currentTenantId) {
      fetchData();
    }
  }, [currentTenantId, fetchData]);

  function handleShiftSelect(shiftId: string) {
    setSelectedShift(shiftId);
    const shift = availableShifts.find(s => s.id === shiftId);
    if (shift) {
      setTitle(`Plantão Disponível - ${shift.sector_name}`);
      const dateFormatted = format(parseISO(shift.shift_date), "dd/MM (EEEE)", { locale: ptBR });
      const value = shift.base_value ? ` - R$ ${shift.base_value.toFixed(2)}` : '';
      setMessage(`Plantão disponível: ${shift.title}\n📅 ${dateFormatted}\n⏰ ${shift.start_time.slice(0,5)} às ${shift.end_time.slice(0,5)}${value}\n\nAcesse o app para se candidatar!`);
      if (shift.sector_id) {
        setSelectedSectorFilter(shift.sector_id);
      }
    }
  }

  function toggleUserSelection(userId: string) {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  }

  async function sendNotifications() {
    if (!currentTenantId || !user) return;
    
    if (!title.trim() || !message.trim()) {
      toast({
        title: 'Preencha todos os campos',
        description: 'Título e mensagem são obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    const eligibleMembers = members.filter((m) => m.role !== 'admin');

    const filteredMembers =
      selectedSectorFilter === 'all'
        ? eligibleMembers
        : eligibleMembers.filter((m) => (memberSectorMap[m.user_id] || []).includes(selectedSectorFilter));

    let targetUsers: string[] = [];

    if (notificationType === 'shift') {
      if (!selectedShift) {
        toast({
          title: 'Selecione um plantão',
          description: 'Para notificação de plantão disponível, escolha o plantão específico.',
          variant: 'destructive',
        });
        return;
      }
      const shift = availableShifts.find((s) => s.id === selectedShift);
      const shiftSectorId = shift?.sector_id ?? null;
      if (!shift || !shiftSectorId) {
        toast({
          title: 'Plantão inválido',
          description: 'Este plantão não possui setor válido para envio.',
          variant: 'destructive',
        });
        return;
      }
      targetUsers = eligibleMembers
        .filter((m) => (memberSectorMap[m.user_id] || []).includes(shiftSectorId))
        .map((m) => m.user_id);
    } else {
      targetUsers = sendToAll
        ? filteredMembers.map((m) => m.user_id)
        : selectedUsers.filter((id) => filteredMembers.some((m) => m.user_id === id));
    }

    if (targetUsers.length === 0) {
      toast({
        title: 'Selecione destinatários',
        description: 'Selecione pelo menos um usuário para enviar a notificação.',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);

    // Create notifications for each user
    // Note: shift_assignment_id is for linking to an assignment, not a shift
    // We don't set it here since we're sending general notifications
    const notifications = targetUsers.map(userId => ({
      tenant_id: currentTenantId,
      user_id: userId,
      type: notificationType,
      title: title.trim(),
      message: message.trim(),
    }));

    const { error } = await supabase
      .from('notifications')
      .insert(notifications);

    setSending(false);

    if (error) {
      console.error('Error sending notifications:', error);
      toast({
        title: 'Erro ao enviar',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Notificações enviadas!',
        description: `${targetUsers.length} usuário(s) notificado(s).`,
      });
      
      // Reset form
      setTitle('');
      setMessage('');
      setSelectedUsers([]);
      setSelectedShift('');
      setSelectedSectorFilter('all');
      setSendToAll(true);
      setNotificationType('general');
      
      // Refresh data
      fetchData();
    }
  }

  async function deleteNotification(id: string) {
    if (!confirm('Deseja excluir esta notificação?')) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Notificação excluída!' });
      fetchData();
    }
  }

  function toggleNotificationSelection(id: string) {
    setSelectedNotifications(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAllNotifications() {
    setSelectedNotifications(new Set(sentNotifications.map(n => n.id)));
  }

  function cancelSelection() {
    setSelectionMode(false);
    setSelectedNotifications(new Set());
  }

  async function deleteSelectedNotifications() {
    if (selectedNotifications.size === 0) return;
    if (!confirm(`Deseja excluir ${selectedNotifications.size} notificação(ões)?`)) return;

    setDeleting(true);
    const ids = Array.from(selectedNotifications);

    const { error } = await supabase
      .from('notifications')
      .delete()
      .in('id', ids);

    setDeleting(false);

    if (error) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: `${ids.length} notificação(ões) excluída(s)!` });
      setSelectionMode(false);
      setSelectedNotifications(new Set());
      fetchData();
    }
  }

  function openEditDialog(notif: SentNotification) {
    setEditingNotification(notif);
    setEditTitle(notif.title ?? '');
    setEditMessage(notif.message ?? '');
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editingNotification) return;

    const nextTitle = editTitle.trim();
    const nextMessage = editMessage.trim();

    if (!nextTitle || !nextMessage) {
      toast({
        title: 'Preencha todos os campos',
        description: 'Título e mensagem são obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase
      .from('notifications')
      .update({ title: nextTitle, message: nextMessage })
      .eq('id', editingNotification.id);

    if (error) {
      toast({
        title: 'Erro ao editar',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Notificação atualizada!' });
    setEditOpen(false);
    setEditingNotification(null);
    fetchData();
  }

  const typeInfo = notificationTypes.find(t => t.value === notificationType);
  const TypeIcon = typeInfo?.icon || Bell;
  const eligibleMembers = members.filter((m) => m.role !== 'admin');
  const filteredMembers =
    selectedSectorFilter === 'all'
      ? eligibleMembers
      : eligibleMembers.filter((m) => (memberSectorMap[m.user_id] || []).includes(selectedSectorFilter));
  const selectedShiftData = availableShifts.find((s) => s.id === selectedShift);
  const shiftScopedCount =
    notificationType === 'shift' && selectedShiftData?.sector_id
      ? eligibleMembers.filter((m) => (memberSectorMap[m.user_id] || []).includes(selectedShiftData.sector_id as string)).length
      : 0;
  const userCount = notificationType === 'shift'
    ? shiftScopedCount
    : sendToAll
      ? filteredMembers.length
      : selectedUsers.filter((id) => filteredMembers.some((m) => m.user_id === id)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Central de Notificações
          </h1>
          <p className="text-muted-foreground">Envie avisos para os plantonistas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearPwaCacheAndReload}
            title="Forçar atualização (limpa cache do app)"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {availableShifts.length} plantões disponíveis
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="send" className="space-y-4">
        <TabsList>
          <TabsTrigger value="send">
            <Send className="mr-2 h-4 w-4" />
            Enviar Notificação
          </TabsTrigger>
          <TabsTrigger value="shifts">
            <Calendar className="mr-2 h-4 w-4" />
            Plantões Disponíveis ({availableShifts.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <Eye className="mr-2 h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Send Notification Tab */}
        <TabsContent value="send" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Form */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Nova Notificação</CardTitle>
                <CardDescription>Crie e envie uma notificação para os plantonistas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Type Selection */}
                <div className="space-y-2">
                  <Label>Tipo de Notificação</Label>
                  <div className="flex flex-wrap gap-2">
                    {notificationTypes.map(type => (
                      <Button
                        key={type.value}
                        variant={notificationType === type.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleTypeChange(type.value)}
                        className="gap-2"
                      >
                        <type.icon className={`h-4 w-4 ${type.color}`} />
                        {type.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Quick Shift Selection */}
                {notificationType === 'shift' && availableShifts.length > 0 && (
                  <div className="space-y-2">
                    <Label>Selecionar Plantão (opcional)</Label>
                    <Select value={selectedShift} onValueChange={handleShiftSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha um plantão para preencher automaticamente" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableShifts.map(shift => (
                          <SelectItem key={shift.id} value={shift.id}>
                            {format(parseISO(shift.shift_date), 'dd/MM')} - {shift.sector_name} - {shift.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Título</Label>
                  <Input
                    id="title"
                    placeholder="Título da notificação"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem</Label>
                  <Textarea
                    id="message"
                    placeholder="Digite a mensagem..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                  />
                </div>

                {/* Recipients */}
                <div className="space-y-3">
                  <Label>Destinatários</Label>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Filtrar por setor (opcional)</Label>
                    <Select
                      value={selectedSectorFilter}
                      onValueChange={(value) => {
                        setSelectedSectorFilter(value);
                        setSelectedUsers([]);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os setores" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os setores</SelectItem>
                        {sectors.map((sector) => (
                          <SelectItem key={sector.id} value={sector.id}>
                            {sector.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="sendToAll" 
                      checked={sendToAll} 
                      onCheckedChange={(checked) => setSendToAll(checked === true)}
                    />
                    <label htmlFor="sendToAll" className="text-sm cursor-pointer">
                      {notificationType === 'shift'
                        ? `Enviar para plantonistas do setor do plantão selecionado (${shiftScopedCount})`
                        : `Enviar para todos os plantonistas do filtro (${filteredMembers.length})`}
                    </label>
                  </div>
                  
                  {!sendToAll && notificationType !== 'shift' && (
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                      {filteredMembers.map(member => (
                        <div key={member.user_id} className="flex items-center gap-2">
                          <Checkbox
                            id={member.user_id}
                            checked={selectedUsers.includes(member.user_id)}
                            onCheckedChange={() => toggleUserSelection(member.user_id)}
                          />
                          <label htmlFor={member.user_id} className="text-sm cursor-pointer">
                            {member.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Send Button */}
                <div className="flex gap-2 pt-4">
                  <Button onClick={() => setPreviewOpen(true)} variant="outline" className="flex-1">
                    <Eye className="mr-2 h-4 w-4" />
                    Pré-visualizar
                  </Button>
                  <Button onClick={sendNotifications} disabled={sending} className="flex-1">
                    {sending ? (
                      'Enviando...'
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Enviar para {userCount} usuário(s)
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Resumo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Plantonistas</span>
                    <Badge variant="secondary">{eligibleMembers.length}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Plantões sem dono</span>
                    <Badge variant="outline" className="text-amber-600">{availableShifts.length}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Notificações hoje</span>
                    <Badge variant="secondary">
                      {sentNotifications.filter(n => 
                        new Date(n.created_at).toDateString() === new Date().toDateString()
                      ).length}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Dicas</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>• Use "Plantão Disponível" para ofertar vagas</p>
                  <p>• "Urgente" aparece em destaque no app</p>
                  <p>• Notificações ficam salvas no histórico</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Available Shifts Tab */}
        <TabsContent value="shifts">
          <Card>
            <CardHeader>
              <CardTitle>Plantões Disponíveis</CardTitle>
              <CardDescription>Plantões futuros sem plantonista atribuído</CardDescription>
            </CardHeader>
            <CardContent>
              {availableShifts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Todos os plantões estão cobertos!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableShifts.map(shift => (
                    <div 
                      key={shift.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{shift.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(shift.shift_date), "dd/MM (EEEE)", { locale: ptBR })} • {shift.start_time.slice(0,5)} - {shift.end_time.slice(0,5)}
                        </p>
                        <Badge variant="outline" className="mt-1">{shift.sector_name}</Badge>
                      </div>
                      <div className="text-right">
                        {shift.base_value && (
                          <p className="font-bold text-green-600">R$ {shift.base_value.toFixed(2)}</p>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="mt-2"
                          onClick={() => {
                            setNotificationType('shift');
                            handleShiftSelect(shift.id);
                          }}
                        >
                          <Bell className="mr-2 h-4 w-4" />
                          Notificar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Histórico de Notificações</CardTitle>
                <CardDescription>Últimas 50 notificações enviadas</CardDescription>
              </div>
              {sentNotifications.length > 0 && (
                <div className="flex items-center gap-2">
                  {selectionMode ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllNotifications}
                      >
                        Selecionar tudo ({sentNotifications.length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelSelection}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={deleteSelectedNotifications}
                        disabled={selectedNotifications.size === 0 || deleting}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir ({selectedNotifications.size})
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectionMode(true)}
                    >
                      Selecionar
                    </Button>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {sentNotifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma notificação enviada ainda</p>
                </div>
              ) : (
                <div className="h-[500px] overflow-auto">
                  <Table className="min-w-[720px]">
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        {selectionMode && <TableHead className="w-10"></TableHead>}
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Destinatário</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sentNotifications.map(notif => {
                        const typeInfo = notificationTypes.find(t => t.value === notif.type);
                        const isSelected = selectedNotifications.has(notif.id);
                        return (
                          <TableRow 
                            key={notif.id}
                            className={isSelected ? 'bg-primary/10' : ''}
                            onClick={selectionMode ? () => toggleNotificationSelection(notif.id) : undefined}
                            style={selectionMode ? { cursor: 'pointer' } : undefined}
                          >
                            {selectionMode && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleNotificationSelection(notif.id)}
                                />
                              </TableCell>
                            )}
                            <TableCell className="text-sm">
                              {format(parseISO(notif.created_at), "dd/MM HH:mm")}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="gap-1">
                                {typeInfo && <typeInfo.icon className={`h-3 w-3 ${typeInfo.color}`} />}
                                {typeInfo?.label || notif.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate">{notif.title}</span>
                                {!selectionMode && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 shrink-0"
                                      aria-label="Ações"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openEditDialog(notif)}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => deleteNotification(notif.id)}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Excluir
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{notif.user_name}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {!selectionMode && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(notif)}>
                                    Editar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteNotification(notif.id)}
                                    className="text-destructive"
                                  >
                                    Excluir
                                  </Button>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar notificação</DialogTitle>
            <DialogDescription>Atualize o título e a mensagem</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editTitle">Título</Label>
              <Input
                id="editTitle"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editMessage">Mensagem</Label>
              <Textarea
                id="editMessage"
                value={editMessage}
                onChange={(e) => setEditMessage(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit}>Salvar alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pré-visualização</DialogTitle>
            <DialogDescription>Como a notificação aparecerá no app</DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${notificationType === 'urgent' ? 'bg-red-500/10' : 'bg-primary/10'}`}>
                <TypeIcon className={`h-5 w-5 ${typeInfo?.color}`} />
              </div>
              <div className="flex-1">
                <p className="font-medium">{title || 'Título da notificação'}</p>
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                  {message || 'Mensagem da notificação...'}
                </p>
                <p className="text-xs text-muted-foreground mt-2">Agora</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Fechar</Button>
            <Button onClick={() => { setPreviewOpen(false); sendNotifications(); }}>
              <Send className="mr-2 h-4 w-4" />
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
