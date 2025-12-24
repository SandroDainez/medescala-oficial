import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SwapRequest { id: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; reason: string | null; created_at: string; origin_assignment: { shift: { title: string; hospital: string; shift_date: string } }; }
interface Assignment { id: string; shift: { title: string; hospital: string; shift_date: string }; }

export default function UserSwaps() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => { if (user && currentTenantId) { fetchSwaps(); fetchAssignments(); } }, [user, currentTenantId]);

  async function fetchSwaps() {
    if (!currentTenantId) return;
    const { data } = await supabase.from('swap_requests').select('id, status, reason, created_at, origin_assignment:shift_assignments!swap_requests_origin_assignment_id_fkey(shift:shifts(title, hospital, shift_date))').eq('tenant_id', currentTenantId).eq('requester_id', user?.id).order('created_at', { ascending: false });
    if (data) setSwaps(data as unknown as SwapRequest[]);
    setLoading(false);
  }

  async function fetchAssignments() {
    if (!currentTenantId) return;
    const { data } = await supabase.from('shift_assignments').select('id, shift:shifts(title, hospital, shift_date)').eq('tenant_id', currentTenantId).eq('user_id', user?.id).in('status', ['assigned', 'confirmed']);
    if (data) setAssignments(data as unknown as Assignment[]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssignment || !currentTenantId) return;
    const { error } = await supabase.from('swap_requests').insert({ tenant_id: currentTenantId, origin_assignment_id: selectedAssignment, requester_id: user?.id, reason: reason || null });
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' }); else { toast({ title: 'Solicitação enviada!' }); setDialogOpen(false); setSelectedAssignment(''); setReason(''); fetchSwaps(); }
  }

  async function cancelRequest(id: string) {
    const { error } = await supabase.from('swap_requests').update({ status: 'cancelled' }).eq('id', id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' }); else { toast({ title: 'Cancelado!' }); fetchSwaps(); }
  }

  const statusColors = { pending: 'bg-yellow-500/10 text-yellow-600', approved: 'bg-green-500/10 text-green-600', rejected: 'bg-red-500/10 text-red-600', cancelled: 'bg-gray-500/10 text-gray-600' };
  const statusLabels = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', cancelled: 'Cancelada' };

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><div><h2 className="text-2xl font-bold text-foreground">Trocas</h2><p className="text-muted-foreground">Solicite trocas de plantão</p></div><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Solicitar</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Solicitar Troca</DialogTitle></DialogHeader><form onSubmit={handleSubmit} className="space-y-4"><div className="space-y-2"><Label>Plantão</Label><Select value={selectedAssignment} onValueChange={setSelectedAssignment}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{assignments.map(a => <SelectItem key={a.id} value={a.id}>{a.shift.title} - {format(new Date(a.shift.shift_date), 'dd/MM', { locale: ptBR })}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Motivo (opcional)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div><Button type="submit" className="w-full" disabled={!selectedAssignment}>Enviar</Button></form></DialogContent></Dialog></div>
      <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Plantão</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{swaps.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhuma solicitação</TableCell></TableRow> : swaps.map(s => <TableRow key={s.id}><TableCell>{format(new Date(s.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell><TableCell>{s.origin_assignment?.shift?.title}</TableCell><TableCell><Badge className={statusColors[s.status]} variant="outline">{statusLabels[s.status]}</Badge></TableCell><TableCell className="text-right">{s.status === 'pending' && <Button variant="ghost" size="sm" onClick={() => cancelRequest(s.id)}><X className="mr-2 h-4 w-4" />Cancelar</Button>}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  );
}
