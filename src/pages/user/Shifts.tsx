import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Clock, LogIn, LogOut, ChevronDown, ChevronUp, MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface Assignment {
  id: string;
  assigned_value: number;
  checkin_at: string | null;
  checkout_at: string | null;
  status: string;
  shift: {
    title: string;
    hospital: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    sector_id: string | null;
  };
}

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

export default function UserShifts() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSectors, setOpenSectors] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user && currentTenantId) {
      fetchData();
    }
  }, [user, currentTenantId]);

  async function fetchData() {
    if (!currentTenantId) return;

    const [assignmentsRes, sectorsRes] = await Promise.all([
      supabase
        .from('shift_assignments')
        .select('id, assigned_value, checkin_at, checkout_at, status, shift:shifts(title, hospital, shift_date, start_time, end_time, sector_id)')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('sectors')
        .select('id, name, color')
        .eq('tenant_id', currentTenantId)
        .eq('active', true)
    ]);

    if (assignmentsRes.data) {
      setAssignments(assignmentsRes.data as unknown as Assignment[]);
    }
    if (sectorsRes.data) {
      setSectors(sectorsRes.data);
      // Open all sectors by default
      setOpenSectors(new Set(sectorsRes.data.map(s => s.id)));
    }
    setLoading(false);
  }

  async function handleCheckin(id: string) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({ checkin_at: new Date().toISOString(), status: 'confirmed', updated_by: user?.id })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Check-in realizado!' });
      fetchData();
    }
  }

  async function handleCheckout(id: string) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({ checkout_at: new Date().toISOString(), status: 'completed', updated_by: user?.id })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Check-out realizado!' });
      fetchData();
    }
  }

  const toggleSector = (sectorId: string) => {
    setOpenSectors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectorId)) {
        newSet.delete(sectorId);
      } else {
        newSet.add(sectorId);
      }
      return newSet;
    });
  };

  const statusColors: Record<string, string> = {
    assigned: 'bg-blue-500/10 text-blue-600 border-blue-200',
    confirmed: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
    completed: 'bg-green-500/10 text-green-600 border-green-200',
    cancelled: 'bg-red-500/10 text-red-600 border-red-200'
  };

  const statusLabels: Record<string, string> = {
    assigned: 'Atribuído',
    confirmed: 'Em andamento',
    completed: 'Concluído',
    cancelled: 'Cancelado'
  };

  // Group assignments by sector
  const groupedAssignments = assignments.reduce((acc, assignment) => {
    const sectorId = assignment.shift.sector_id || 'sem-setor';
    if (!acc[sectorId]) {
      acc[sectorId] = [];
    }
    acc[sectorId].push(assignment);
    return acc;
  }, {} as Record<string, Assignment[]>);

  // Get sector info by id
  const getSectorInfo = (sectorId: string): { name: string; color: string } => {
    if (sectorId === 'sem-setor') {
      return { name: 'Sem Setor', color: '#6b7280' };
    }
    const sector = sectors.find(s => s.id === sectorId);
    return {
      name: sector?.name || 'Desconhecido',
      color: sector?.color || '#6b7280'
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Meus Plantões</h2>
        <p className="text-muted-foreground">Visualize e faça check-in/out dos seus plantões</p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nenhum plantão atribuído</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedAssignments).map(([sectorId, sectorAssignments]) => {
            const sectorInfo = getSectorInfo(sectorId);
            const isOpen = openSectors.has(sectorId);

            return (
              <Collapsible
                key={sectorId}
                open={isOpen}
                onOpenChange={() => toggleSector(sectorId)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: sectorInfo.color }}
                        />
                        <span className="font-semibold text-foreground">{sectorInfo.name}</span>
                        <Badge variant="secondary" className="ml-2">
                          {sectorAssignments.length} plantão{sectorAssignments.length !== 1 ? 'ões' : ''}
                        </Badge>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4">
                      <div className="space-y-3">
                        {sectorAssignments.map(a => (
                          <div
                            key={a.id}
                            className="p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-medium text-foreground">{a.shift.title}</h4>
                                  <Badge className={statusColors[a.status]} variant="outline">
                                    {statusLabels[a.status]}
                                  </Badge>
                                </div>
                                
                                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    {format(new Date(a.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-4 w-4" />
                                    {a.shift.start_time.slice(0, 5)} - {a.shift.end_time.slice(0, 5)}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-4 w-4" />
                                    {sectorInfo.name}
                                  </div>
                                </div>

                                {a.assigned_value > 0 && (
                                  <p className="text-sm font-medium text-primary">
                                    R$ {Number(a.assigned_value).toFixed(2)}
                                  </p>
                                )}

                                {a.checkin_at && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    Check-in: {format(new Date(a.checkin_at), 'HH:mm')}
                                    {a.checkout_at && ` | Check-out: ${format(new Date(a.checkout_at), 'HH:mm')}`}
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-2 flex-shrink-0">
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
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
