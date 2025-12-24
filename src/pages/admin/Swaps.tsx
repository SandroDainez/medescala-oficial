import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SwapRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
  admin_notes: string | null;
  created_at: string;
  requester: { name: string | null };
  target_user: { name: string | null } | null;
  origin_assignment: { shift: { title: string; hospital: string; shift_date: string } };
}

export default function AdminSwaps() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSwap, setSelectedSwap] = useState<SwapRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (currentTenantId) fetchSwaps();
  }, [currentTenantId]);

  async function fetchSwaps() {
    if (!currentTenantId) return;
    const { data } = await supabase
      .from('swap_requests')
      .select(`id, status, reason, admin_notes, created_at, requester:profiles!swap_requests_requester_id_profiles_fkey(name), target_user:profiles!swap_requests_target_user_id_profiles_fkey(name), origin_assignment:shift_assignments!swap_requests_origin_assignment_id_fkey(shift:shifts(title, hospital, shift_date))`)
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });
    if (data) setSwaps(data as unknown as SwapRequest[]);
    setLoading(false);
  }

  async function handleAction(action: 'approved' | 'rejected') {
    if (!selectedSwap) return;
    const { error } = await supabase.from('swap_requests').update({ status: action, admin_notes: adminNotes || null, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', selectedSwap.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: action === 'approved' ? 'Troca aprovada!' : 'Troca rejeitada!' }); fetchSwaps(); setDialogOpen(false); setSelectedSwap(null); setAdminNotes(''); }
  }

  const statusColors = { pending: 'bg-yellow-500/10 text-yellow-600', approved: 'bg-green-500/10 text-green-600', rejected: 'bg-red-500/10 text-red-600', cancelled: 'bg-gray-500/10 text-gray-600' };
  const statusLabels = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', cancelled: 'Cancelada' };

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-foreground">Trocas</h2><p className="text-muted-foreground">Gerencie as solicitações de troca</p></div>
      <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Solicitante</TableHead><TableHead>Plantão</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
        {swaps.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma solicitação</TableCell></TableRow> : swaps.map((swap) => (
          <TableRow key={swap.id}><TableCell>{format(new Date(swap.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell><TableCell>{swap.requester?.name || 'N/A'}</TableCell><TableCell>{swap.origin_assignment?.shift?.title}</TableCell><TableCell><Badge className={statusColors[swap.status]} variant="outline">{statusLabels[swap.status]}</Badge></TableCell><TableCell className="text-right">{swap.status === 'pending' && <div className="flex justify-end gap-2"><Button variant="ghost" size="icon" className="text-green-600" onClick={() => { setSelectedSwap(swap); setDialogOpen(true); }}><Check className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setSelectedSwap(swap); setDialogOpen(true); }}><X className="h-4 w-4" /></Button></div>}</TableCell></TableRow>
        ))}
      </TableBody></Table></CardContent></Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>Analisar Troca</DialogTitle></DialogHeader><div className="space-y-4">{selectedSwap?.reason && <div><p className="text-sm font-medium">Motivo:</p><p className="text-sm text-muted-foreground">{selectedSwap.reason}</p></div>}<div className="space-y-2"><label className="text-sm font-medium">Observações:</label><Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Opcional" /></div><div className="flex gap-2"><Button className="flex-1" onClick={() => handleAction('approved')}><Check className="mr-2 h-4 w-4" />Aprovar</Button><Button variant="destructive" className="flex-1" onClick={() => handleAction('rejected')}><X className="mr-2 h-4 w-4" />Rejeitar</Button></div></div></DialogContent></Dialog>
    </div>
  );
}
