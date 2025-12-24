import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Assignment {
  id: string;
  assigned_value: number;
  checkin_at: string | null;
  checkout_at: string | null;
  status: string;
  shift: {
    title: string;
    hospital: string;
    location: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
  };
}

export default function UserShifts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchAssignments();
  }, [user]);

  async function fetchAssignments() {
    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        assigned_value,
        checkin_at,
        checkout_at,
        status,
        shift:shifts(title, hospital, location, shift_date, start_time, end_time)
      `)
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAssignments(data as unknown as Assignment[]);
    }
    setLoading(false);
  }

  async function handleCheckin(assignmentId: string) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({
        checkin_at: new Date().toISOString(),
        status: 'confirmed',
        updated_by: user?.id,
      })
      .eq('id', assignmentId);

    if (error) {
      toast({ title: 'Erro ao fazer check-in', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Check-in realizado!' });
      fetchAssignments();
    }
  }

  async function handleCheckout(assignmentId: string) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({
        checkout_at: new Date().toISOString(),
        status: 'completed',
        updated_by: user?.id,
      })
      .eq('id', assignmentId);

    if (error) {
      toast({ title: 'Erro ao fazer check-out', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Check-out realizado!' });
      fetchAssignments();
    }
  }

  const statusColors = {
    assigned: 'bg-blue-500/10 text-blue-600',
    confirmed: 'bg-yellow-500/10 text-yellow-600',
    completed: 'bg-green-500/10 text-green-600',
    cancelled: 'bg-red-500/10 text-red-600',
  };

  const statusLabels = {
    assigned: 'Atribuído',
    confirmed: 'Em andamento',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Meus Plantões</h2>
        <p className="text-muted-foreground">Visualize seus plantões e faça check-in/out</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Plantão</TableHead>
                <TableHead>Horário</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Você não tem plantões atribuídos
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {format(new Date(a.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{a.shift.title}</p>
                        <p className="text-sm text-muted-foreground">{a.shift.hospital}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {a.shift.start_time.slice(0, 5)} - {a.shift.end_time.slice(0, 5)}
                    </TableCell>
                    <TableCell>R$ {Number(a.assigned_value).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[a.status as keyof typeof statusColors]} variant="outline">
                        {statusLabels[a.status as keyof typeof statusLabels]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {a.status === 'assigned' && !a.checkin_at && (
                          <Button size="sm" onClick={() => handleCheckin(a.id)}>
                            <LogIn className="mr-2 h-4 w-4" />
                            Check-in
                          </Button>
                        )}
                        {a.checkin_at && !a.checkout_at && (
                          <Button size="sm" variant="outline" onClick={() => handleCheckout(a.id)}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Check-out
                          </Button>
                        )}
                        {a.checkin_at && (
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Clock className="mr-1 h-3 w-3" />
                            {format(new Date(a.checkin_at), 'HH:mm')}
                            {a.checkout_at && ` - ${format(new Date(a.checkout_at), 'HH:mm')}`}
                          </div>
                        )}
                      </div>
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
