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
import { useToast } from '@/hooks/use-toast';
import { Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SwapRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
  admin_notes: string | null;
  created_at: string;
  origin_assignment: {
    shift: {
      title: string;
      hospital: string;
      shift_date: string;
    };
  };
}

interface Assignment {
  id: string;
  shift: {
    title: string;
    hospital: string;
    shift_date: string;
  };
}

export default function UserSwaps() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (user) {
      fetchSwaps();
      fetchAssignments();
    }
  }, [user]);

  async function fetchSwaps() {
    const { data } = await supabase
      .from('swap_requests')
      .select(`
        id,
        status,
        reason,
        admin_notes,
        created_at,
        origin_assignment:shift_assignments!swap_requests_origin_assignment_id_fkey(
          shift:shifts(title, hospital, shift_date)
        )
      `)
      .eq('requester_id', user?.id)
      .order('created_at', { ascending: false });

    if (data) setSwaps(data as unknown as SwapRequest[]);
    setLoading(false);
  }

  async function fetchAssignments() {
    const { data } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        shift:shifts(title, hospital, shift_date)
      `)
      .eq('user_id', user?.id)
      .in('status', ['assigned', 'confirmed']);

    if (data) setAssignments(data as unknown as Assignment[]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssignment) return;

    const { error } = await supabase.from('swap_requests').insert({
      origin_assignment_id: selectedAssignment,
      requester_id: user?.id,
      reason: reason || null,
    });

    if (error) {
      toast({ title: 'Erro ao solicitar troca', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Solicitação enviada!' });
      setDialogOpen(false);
      setSelectedAssignment('');
      setReason('');
      fetchSwaps();
    }
  }

  async function cancelRequest(id: string) {
    const { error } = await supabase
      .from('swap_requests')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      toast({ title: 'Erro ao cancelar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Solicitação cancelada!' });
      fetchSwaps();
    }
  }

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-600',
    approved: 'bg-green-500/10 text-green-600',
    rejected: 'bg-red-500/10 text-red-600',
    cancelled: 'bg-gray-500/10 text-gray-600',
  };

  const statusLabels = {
    pending: 'Pendente',
    approved: 'Aprovada',
    rejected: 'Rejeitada',
    cancelled: 'Cancelada',
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Trocas</h2>
          <p className="text-muted-foreground">Solicite e acompanhe trocas de plantão</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Solicitar Troca
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Solicitar Troca de Plantão</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Plantão</Label>
                <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o plantão" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.shift.title} - {a.shift.hospital} ({format(new Date(a.shift.shift_date), 'dd/MM', { locale: ptBR })})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Motivo (opcional)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Descreva o motivo da troca"
                />
              </div>
              <Button type="submit" className="w-full" disabled={!selectedAssignment}>
                Enviar Solicitação
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
                <TableHead>Plantão</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {swaps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Você não tem solicitações de troca
                  </TableCell>
                </TableRow>
              ) : (
                swaps.map((swap) => (
                  <TableRow key={swap.id}>
                    <TableCell>
                      {format(new Date(swap.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{swap.origin_assignment?.shift?.title}</p>
                        <p className="text-sm text-muted-foreground">{swap.origin_assignment?.shift?.hospital}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {swap.reason || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[swap.status]} variant="outline">
                        {statusLabels[swap.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {swap.status === 'pending' && (
                        <Button variant="ghost" size="sm" onClick={() => cancelRequest(swap.id)}>
                          <X className="mr-2 h-4 w-4" />
                          Cancelar
                        </Button>
                      )}
                      {swap.admin_notes && (
                        <span className="text-xs text-muted-foreground">{swap.admin_notes}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
