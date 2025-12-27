import { useState, useEffect } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { 
  Bell, Send, Users, Calendar, DollarSign, ArrowLeftRight, 
  AlertCircle, CheckCircle, Plus, Trash2, Eye
} from 'lucide-react';
import { format, parseISO, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Member {
  user_id: string;
  name: string;
  role: string;
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
  sector_name: string;
  base_value: number | null;
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
  const [sentNotifications, setSentNotifications] = useState<SentNotification[]>([]);
  const [availableShifts, setAvailableShifts] = useState<AvailableShift[]>([]);
  
  // Form state
  const [notificationType, setNotificationType] = useState('general');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(true);
  const [selectedShift, setSelectedShift] = useState<string>('');
  
  // Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (currentTenantId) {
      fetchData();
    }
  }, [currentTenantId]);

  async function fetchData() {
    if (!currentTenantId) return;
    setLoading(true);

    // Fetch members
    const { data: membersData } = await supabase
      .from('memberships')
      .select('user_id, role, profile:profiles!memberships_user_id_profiles_fkey(name)')
      .eq('tenant_id', currentTenantId)
      .eq('active', true);

    if (membersData) {
      setMembers(membersData.map(m => ({
        user_id: m.user_id,
        name: (m.profile as any)?.name || 'Sem nome',
        role: m.role,
      })));
    }

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
        .select('id, name')
        .in('id', userIds);

      const profileMap = new Map(profilesData?.map(p => [p.id, p.name]) || []);
      
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
        id, title, shift_date, start_time, end_time, base_value,
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
          sector_name: (s.sector as any)?.name || 'Sem setor',
          base_value: s.base_value,
        }));

      setAvailableShifts(available);
    }

    setLoading(false);
  }

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

  function handleShiftSelect(shiftId: string) {
    setSelectedShift(shiftId);
    const shift = availableShifts.find(s => s.id === shiftId);
    if (shift) {
      setTitle(`Plantão Disponível - ${shift.sector_name}`);
      const dateFormatted = format(parseISO(shift.shift_date), "dd/MM (EEEE)", { locale: ptBR });
      const value = shift.base_value ? ` - R$ ${shift.base_value.toFixed(2)}` : '';
      setMessage(`Plantão disponível: ${shift.title}\n📅 ${dateFormatted}\n⏰ ${shift.start_time.slice(0,5)} às ${shift.end_time.slice(0,5)}${value}\n\nAcesse o app para se candidatar!`);
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

    const targetUsers = sendToAll 
      ? members.filter(m => m.role === 'user').map(m => m.user_id)
      : selectedUsers;

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

  const typeInfo = notificationTypes.find(t => t.value === notificationType);
  const TypeIcon = typeInfo?.icon || Bell;
  const userCount = sendToAll 
    ? members.filter(m => m.role === 'user').length 
    : selectedUsers.length;

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
        <Badge variant="outline" className="text-lg px-4 py-2">
          {availableShifts.length} plantões disponíveis
        </Badge>
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
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="sendToAll" 
                      checked={sendToAll} 
                      onCheckedChange={(checked) => setSendToAll(checked === true)}
                    />
                    <label htmlFor="sendToAll" className="text-sm cursor-pointer">
                      Enviar para todos os plantonistas ({members.filter(m => m.role === 'user').length})
                    </label>
                  </div>
                  
                  {!sendToAll && (
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                      {members.filter(m => m.role === 'user').map(member => (
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
                    <Badge variant="secondary">{members.filter(m => m.role === 'user').length}</Badge>
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
            <CardHeader>
              <CardTitle>Histórico de Notificações</CardTitle>
              <CardDescription>Últimas 50 notificações enviadas</CardDescription>
            </CardHeader>
            <CardContent>
              {sentNotifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma notificação enviada ainda</p>
                </div>
              ) : (
                <div className="h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
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
                        return (
                          <TableRow key={notif.id}>
                            <TableCell className="text-sm">
                              {format(parseISO(notif.created_at), "dd/MM HH:mm")}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="gap-1">
                                {typeInfo && <typeInfo.icon className={`h-3 w-3 ${typeInfo.color}`} />}
                                {typeInfo?.label || notif.type}
                            </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{notif.title}</TableCell>
                            <TableCell className="text-muted-foreground">{notif.user_name}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteNotification(notif.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
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
