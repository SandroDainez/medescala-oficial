import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { parseDateOnly } from '@/lib/utils';
import { ArrowRightLeft, Send, Calendar, Clock, Check, X, User, Inbox, History } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TapSafeButton } from '@/components/TapSafeButton';
import { useUserSwaps } from '@/hooks/useUserSwaps';
import type { SwapAssignment as Assignment, SwapRequestItem as SwapRequest, SwapTenantMember as TenantMember } from '@/services/userSwaps';

type SwapsTab = 'my-shifts' | 'incoming' | 'history';

export default function UserSwaps() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const {
    myAssignments,
    tenantMembers,
    mySwapRequests,
    incomingSwapRequests,
    currentUserDisplayName,
    loadSectorMembers,
    submitSwap,
    decideSwap,
    cancelSwap,
    isLoading,
    isSubmittingSwap,
    isDecidingSwap,
    isCancellingSwap,
  } = useUserSwaps({
    userId: user?.id,
    tenantId: currentTenantId,
  });
  const [sectorMembers, setSectorMembers] = useState<TenantMember[]>([]);
  const [loadingSectorMembers, setLoadingSectorMembers] = useState(false);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [didAutoSelect, setDidAutoSelect] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectUserDialogOpen, setSelectUserDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedTargetUser, setSelectedTargetUser] = useState<TenantMember | null>(null);
  const [reason, setReason] = useState('');
  const [activeTab, setActiveTab] = useState<SwapsTab>('my-shifts');
  const processing = isSubmittingSwap || isDecidingSwap || isCancellingSwap;

  const monthOptions = useMemo(
    () => [
      { value: 0, label: 'Janeiro' },
      { value: 1, label: 'Fevereiro' },
      { value: 2, label: 'Março' },
      { value: 3, label: 'Abril' },
      { value: 4, label: 'Maio' },
      { value: 5, label: 'Junho' },
      { value: 6, label: 'Julho' },
      { value: 7, label: 'Agosto' },
      { value: 8, label: 'Setembro' },
      { value: 9, label: 'Outubro' },
      { value: 10, label: 'Novembro' },
      { value: 11, label: 'Dezembro' },
    ],
    []
  );

  const yearOptions = useMemo(() => {
    const baseYear = new Date().getFullYear();
    const assignmentYears = myAssignments.map((a) => Number(a.shift.shift_date.slice(0, 4)));
    const allYears = new Set<number>();
    // Range fixo de 10 anos antes e depois
    for (let y = baseYear - 10; y <= baseYear + 10; y++) {
      allYears.add(y);
    }
    // Adiciona anos com dados (caso haja fora do range)
    assignmentYears.forEach(y => allYears.add(y));
    return Array.from(allYears).sort((a, b) => b - a); // Ordem decrescente
  }, [myAssignments]);

  const effectiveMonth = selectedMonth ?? now.getMonth();
  const effectiveYear = selectedYear ?? now.getFullYear();

  const monthAssignments = useMemo(() => {
    const inMonth = myAssignments.filter((a) => {
      const year = Number(a.shift.shift_date.slice(0, 4));
      const month = Number(a.shift.shift_date.slice(5, 7)) - 1;
      return year === effectiveYear && month === effectiveMonth;
    });

    return inMonth.sort((a, b) => {
      const ad = `${a.shift.shift_date}T${a.shift.start_time}`;
      const bd = `${b.shift.shift_date}T${b.shift.start_time}`;
      return ad.localeCompare(bd);
    });
  }, [myAssignments, effectiveMonth, effectiveYear]);

  useEffect(() => {
    if (didAutoSelect || myAssignments.length === 0) return;
    const sortedDates = myAssignments
      .map((a) => parseDateOnly(a.shift.shift_date))
      .sort((a, b) => a.getTime() - b.getTime());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nearestFutureShift = sortedDates.find((d) => d >= today) || sortedDates[sortedDates.length - 1];

    if (nearestFutureShift) {
      setSelectedMonth(nearestFutureShift.getMonth());
      setSelectedYear(nearestFutureShift.getFullYear());
      setDidAutoSelect(true);
    }
  }, [myAssignments, didAutoSelect]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'incoming' || tab === 'history' || tab === 'my-shifts') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const assignmentId = searchParams.get('assignment');
    if (!assignmentId || myAssignments.length === 0) return;

    const assignment = myAssignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      setSearchParams({}, { replace: true });
      return;
    }

    const shiftDate = parseDateOnly(assignment.shift.shift_date);
    setSelectedMonth(shiftDate.getMonth());
    setSelectedYear(shiftDate.getFullYear());
    setSelectedDay(assignment.shift.shift_date);
    handleShiftClick(assignment);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myAssignments, searchParams, setSearchParams]);

  useEffect(() => {
    const originAssignmentId = searchParams.get('origin_assignment_id');
    if (!originAssignmentId) return;

    const incomingMatch = incomingSwapRequests.find((swap) => swap.origin_assignment_id === originAssignmentId);
    if (incomingMatch?.origin_assignment?.shift?.shift_date) {
      setActiveTab('incoming');
      setSelectedDay(incomingMatch.origin_assignment.shift.shift_date);
      return;
    }

    const historyMatch = mySwapRequests.find((swap) => swap.origin_assignment_id === originAssignmentId);
    if (historyMatch) {
      setActiveTab('history');
    }
  }, [incomingSwapRequests, mySwapRequests, searchParams]);

  const availableDays = useMemo(() => {
    const unique = Array.from(new Set(monthAssignments.map((a) => a.shift.shift_date))).sort();
    return unique;
  }, [monthAssignments]);

  const visibleAssignments = useMemo(() => {
    if (selectedDay === 'all') return monthAssignments;
    return monthAssignments.filter((a) => a.shift.shift_date === selectedDay);
  }, [monthAssignments, selectedDay]);

  const groupedVisibleAssignments = useMemo(() => {
    const byDate = new Map<
      string,
      {
        sectors: Map<string, { sectorName: string; sectorColor: string | null; assignments: Assignment[] }>;
      }
    >();

    visibleAssignments.forEach((assignment) => {
      const dateKey = assignment.shift.shift_date;
      const sectorKey = assignment.shift.sector_id || 'sem-setor';
      const sectorName = assignment.shift.sector?.name || 'Sem setor';
      const sectorColor = assignment.shift.sector?.color ?? null;

      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { sectors: new Map() });
      }

      const dateGroup = byDate.get(dateKey)!;
      if (!dateGroup.sectors.has(sectorKey)) {
        dateGroup.sectors.set(sectorKey, {
          sectorName,
          sectorColor,
          assignments: [],
        });
      }

      dateGroup.sectors.get(sectorKey)!.assignments.push(assignment);
    });

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dateGroup]) => ({
        date,
        sectors: Array.from(dateGroup.sectors.values())
          .sort((a, b) => a.sectorName.localeCompare(b.sectorName, 'pt-BR'))
          .map((sector) => ({
            ...sector,
            assignments: [...sector.assignments].sort((a, b) =>
              `${a.shift.shift_date}T${a.shift.start_time}`.localeCompare(`${b.shift.shift_date}T${b.shift.start_time}`)
            ),
          })),
      }));
  }, [visibleAssignments]);

  const groupedIncomingRequests = useMemo(() => {
    const byDate = new Map<
      string,
      {
        sectors: Map<string, { sectorName: string; sectorColor: string | null; requests: SwapRequest[] }>;
      }
    >();

    incomingSwapRequests.forEach((swap) => {
      const dateKey = swap.origin_assignment?.shift?.shift_date;
      if (!dateKey) return;

      const sectorKey = swap.origin_assignment?.shift?.sector_id || 'sem-setor';
      const sectorName = swap.origin_assignment?.shift?.sector?.name || 'Sem setor';
      const sectorColor = swap.origin_assignment?.shift?.sector?.color ?? null;

      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { sectors: new Map() });
      }

      const dateGroup = byDate.get(dateKey)!;
      if (!dateGroup.sectors.has(sectorKey)) {
        dateGroup.sectors.set(sectorKey, {
          sectorName,
          sectorColor,
          requests: [],
        });
      }

      dateGroup.sectors.get(sectorKey)!.requests.push(swap);
    });

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dateGroup]) => ({
        date,
        sectors: Array.from(dateGroup.sectors.values())
          .sort((a, b) => a.sectorName.localeCompare(b.sectorName, 'pt-BR'))
          .map((sector) => ({
            ...sector,
            requests: [...sector.requests].sort((a, b) =>
              `${a.origin_assignment?.shift?.shift_date || ''}T${a.origin_assignment?.shift?.start_time || ''}`.localeCompare(
                `${b.origin_assignment?.shift?.shift_date || ''}T${b.origin_assignment?.shift?.start_time || ''}`
              )
            ),
          })),
      }));
  }, [incomingSwapRequests]);

  useEffect(() => {
    if (user && currentTenantId) {
      setDidAutoSelect(false);
    }
  }, [user, currentTenantId]);

  useEffect(() => {
    setSelectedDay('all');
  }, [effectiveMonth, effectiveYear]);

  async function handleShiftClick(assignment: Assignment) {
    setSelectedAssignment(assignment);
    setSelectUserDialogOpen(true);
    
    // Get sector_id from assignment and fetch sector members
    const sectorId = assignment.shift.sector_id;
    
    if (sectorId) {
      setLoadingSectorMembers(true);
      try {
        const members = await loadSectorMembers(sectorId, tenantMembers);
        setSectorMembers(members);
      } catch (error) {
        toast({
          title: 'Erro ao carregar colegas',
          description: error instanceof Error ? error.message : 'Não foi possível carregar colegas elegíveis.',
          variant: 'destructive',
        });
        setSectorMembers([]);
      } finally {
        setLoadingSectorMembers(false);
      }
    } else {
      setSectorMembers(tenantMembers);
    }
  }

  function handleUserSelect(member: TenantMember) {
    setSelectedTargetUser(member);
    setSelectUserDialogOpen(false);
    setConfirmDialogOpen(true);
  }

  async function handleSubmitSwapRequest() {
    if (!selectedAssignment || !selectedTargetUser || !currentTenantId || !user) return;
    try {
      await submitSwap({
        currentUserDisplayName,
        selectedAssignment,
        selectedTargetUser,
        reason,
      });
      toast({ title: 'Solicitação enviada!', description: `Aguardando ${selectedTargetUser.name} aceitar.` });
      setConfirmDialogOpen(false);
      setSelectedAssignment(null);
      setSelectedTargetUser(null);
      setReason('');
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível enviar a solicitação.',
        variant: 'destructive',
      });
    }
  }

  async function handleAcceptSwap(swap: SwapRequest) {
    if (!currentTenantId || !user) return;
    try {
      await decideSwap({
        currentUserDisplayName,
        swap,
        decision: 'approved',
      });
      toast({ title: 'Troca aceita!', description: 'O plantão foi transferido para você.' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Não foi possível aceitar a troca.';
      const lowerMessage = String(errorMessage || '').toLowerCase();
      const isConflictError = lowerMessage.includes('conflito') || lowerMessage.includes('horário');
      const isEligibilityError = lowerMessage.includes('plantonista') || lowerMessage.includes('tenant');
      toast({
        title: isConflictError ? 'Troca bloqueada por conflito de horário' : 'Erro ao aceitar troca',
        description: isEligibilityError
          ? 'O colega selecionado não está mais elegível para assumir plantões neste hospital.'
          : errorMessage,
        variant: 'destructive',
      });
    }
  }

  async function handleRejectSwap(swap: SwapRequest) {
    if (!currentTenantId || !user) return;
    try {
      await decideSwap({
        currentUserDisplayName,
        swap,
        decision: 'rejected',
      });
      toast({ title: 'Troca recusada.' });
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível recusar a troca.',
        variant: 'destructive',
      });
    }
  }

  async function handleCancelRequest(swapId: string) {
    try {
      await cancelSwap(swapId);
      toast({ title: 'Solicitação cancelada.' });
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível cancelar a solicitação.',
        variant: 'destructive',
      });
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    approved: 'bg-green-500/10 text-green-600 border-green-500/30',
    rejected: 'bg-red-500/10 text-red-600 border-red-500/30',
    cancelled: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovada',
    rejected: 'Recusada',
    cancelled: 'Cancelada',
  };

  if (isLoading) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Trocas de Plantão</h2>
        <p className="text-sm text-muted-foreground">Passe ou troque plantões com colegas</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SwapsTab)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="my-shifts" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Passar Plantão</span>
            <span className="sm:hidden">Passar</span>
          </TabsTrigger>
          <TabsTrigger value="incoming" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Recebidas</span>
            <span className="sm:hidden">Recebidas</span>
            {incomingSwapRequests.length > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5">
                {incomingSwapRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Histórico</span>
            <span className="sm:hidden">Histórico</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-shifts" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Meus Plantões por Dia e Setor</CardTitle>
              <p className="text-sm text-muted-foreground">Escolha o plantão e envie para um colega do mesmo setor</p>

              <div className="grid gap-3 pt-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-foreground">Mês</div>
                  <Select value={String(effectiveMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Mês" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-medium text-foreground">Ano</div>
                  <Select value={String(effectiveYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-medium text-foreground">Dia</div>
                  <Select value={selectedDay} onValueChange={setSelectedDay}>
                    <SelectTrigger>
                      <SelectValue placeholder="Dia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {availableDays.map((d) => (
                        <SelectItem key={d} value={d}>
                          {format(parseDateOnly(d), 'dd/MM/yyyy', { locale: ptBR })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {visibleAssignments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum plantão disponível para passar neste filtro.</p>
              ) : (
                <div className="space-y-4">
                  {groupedVisibleAssignments.map((dayGroup) => (
                    <div key={dayGroup.date} className="space-y-3">
                      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                        <div className="text-sm font-semibold text-foreground">
                          {format(parseDateOnly(dayGroup.date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {dayGroup.sectors.map((sectorGroup) => (
                          <div key={`${dayGroup.date}-${sectorGroup.sectorName}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                            <div
                              className="rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                              style={{
                                backgroundColor: sectorGroup.sectorColor ? `${sectorGroup.sectorColor}18` : 'hsl(var(--muted))',
                                borderLeft: `4px solid ${sectorGroup.sectorColor || 'hsl(var(--muted-foreground))'}`,
                              }}
                            >
                              {sectorGroup.sectorName}
                            </div>

                            <div className="grid gap-2">
                              {sectorGroup.assignments.map((assignment) => (
                                <TapSafeButton
                                  key={assignment.id}
                                  type="button"
                                  moveThresholdPx={24}
                                  minPressTime={60}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShiftClick(assignment);
                                  }}
                                  className="w-full cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 active:bg-accent select-none"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                      <div className="font-medium">{assignment.shift.title}</div>
                                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {assignment.shift.start_time.slice(0, 5)} - {assignment.shift.end_time.slice(0, 5)}
                                      </div>
                                      <div className="text-xs text-muted-foreground">{assignment.shift.hospital}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-[10px]">Enviar para</Badge>
                                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  </div>
                                </TapSafeButton>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incoming" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Solicitações Recebidas</CardTitle>
              <p className="text-sm text-muted-foreground">Solicitações organizadas por dia e setor</p>
            </CardHeader>
            <CardContent>
              {incomingSwapRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma solicitação pendente.</p>
              ) : (
                <div className="space-y-4">
                  {groupedIncomingRequests.map((dayGroup) => (
                    <div key={dayGroup.date} className="space-y-3">
                      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                        <div className="text-sm font-semibold text-foreground">
                          {format(parseDateOnly(dayGroup.date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {dayGroup.sectors.map((sectorGroup) => (
                          <div key={`${dayGroup.date}-${sectorGroup.sectorName}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                            <div
                              className="rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                              style={{
                                backgroundColor: sectorGroup.sectorColor ? `${sectorGroup.sectorColor}18` : 'hsl(var(--muted))',
                                borderLeft: `4px solid ${sectorGroup.sectorColor || 'hsl(var(--muted-foreground))'}`,
                              }}
                            >
                              {sectorGroup.sectorName}
                            </div>

                            <div className="grid gap-3">
                              {sectorGroup.requests.map((swap) => (
                                <div
                                  key={swap.id}
                                  className={`rounded-lg border p-3 ${
                                    searchParams.get('origin_assignment_id') === swap.origin_assignment_id
                                      ? 'border-primary ring-2 ring-primary/20'
                                      : ''
                                  }`}
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <User className="h-4 w-4 text-primary" />
                                      <span className="font-medium">{swap.requester?.name}</span>
                                      <span className="text-muted-foreground">quer passar:</span>
                                    </div>
                                    <div className="pl-6 space-y-1">
                                      <div className="font-medium">{swap.origin_assignment?.shift?.title}</div>
                                      <div className="text-sm text-muted-foreground">
                                        {swap.origin_assignment?.shift?.hospital || 'Hospital não informado'}
                                      </div>
                                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {swap.origin_assignment?.shift?.start_time?.slice(0, 5)} - {swap.origin_assignment?.shift?.end_time?.slice(0, 5)}
                                      </div>
                                      {swap.reason && (
                                        <div className="text-sm text-muted-foreground italic mt-2">"{swap.reason}"</div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-2 mt-4">
                                    <Button onClick={() => handleAcceptSwap(swap)} disabled={processing} className="flex-1" size="sm">
                                      <Check className="h-4 w-4 mr-1" />
                                      Aceitar
                                    </Button>
                                    <Button
                                      onClick={() => handleRejectSwap(swap)}
                                      disabled={processing}
                                      variant="outline"
                                      className="flex-1"
                                      size="sm"
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      Recusar
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Minhas Solicitações</CardTitle>
              <p className="text-sm text-muted-foreground">Histórico de plantões que você solicitou passar</p>
            </CardHeader>
            <CardContent>
              {mySwapRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma solicitação enviada.</p>
              ) : (
                <div className="grid gap-3">
                  {mySwapRequests.map((swap) => (
                    <div
                      key={swap.id}
                      className={`p-4 border rounded-lg ${
                        searchParams.get('origin_assignment_id') === swap.origin_assignment_id
                          ? 'border-primary ring-2 ring-primary/20'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="font-medium">{swap.origin_assignment?.shift?.title}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {swap.origin_assignment?.shift?.shift_date &&
                              format(parseDateOnly(swap.origin_assignment.shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Para: <span className="font-medium">{swap.target_user?.name || 'N/A'}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Local: <span className="font-medium">{swap.origin_assignment?.shift?.hospital || 'Hospital não informado'}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Horário: <span className="font-medium">{swap.origin_assignment?.shift?.start_time?.slice(0, 5)} - {swap.origin_assignment?.shift?.end_time?.slice(0, 5)}</span>
                          </div>
                          {swap.origin_assignment?.shift?.sector?.name && (
                            <div className="text-sm text-muted-foreground">
                              Setor: <span className="font-medium">{swap.origin_assignment.shift.sector.name}</span>
                            </div>
                          )}
                          {swap.reason && (
                            <div className="text-sm text-muted-foreground italic">
                              "{swap.reason}"
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge className={statusColors[swap.status]} variant="outline">
                            {statusLabels[swap.status]}
                          </Badge>
                          {swap.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelRequest(swap.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={selectUserDialogOpen} onOpenChange={setSelectUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Passar Plantão</DialogTitle>
            <DialogDescription>Selecione o colega que assumirá este plantão</DialogDescription>
          </DialogHeader>
          {selectedAssignment && (
            <div className="p-3 bg-muted rounded-lg mb-4">
              <div className="font-medium">{selectedAssignment.shift.title}</div>
              <div className="text-sm text-muted-foreground">
                {format(parseDateOnly(selectedAssignment.shift.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedAssignment.shift.start_time.slice(0, 5)} - {selectedAssignment.shift.end_time.slice(0, 5)}
              </div>
            </div>
          )}
          <div
            className="space-y-2 max-h-[60dvh] overflow-y-auto overscroll-contain touch-pan-y"
            style={{ WebkitOverflowScrolling: 'touch' } as any}
          >
            {loadingSectorMembers ? (
              <p className="text-center text-muted-foreground py-4">Carregando colegas do setor...</p>
            ) : sectorMembers.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhum colega disponível neste setor.</p>
            ) : (
               sectorMembers.map((member) => (
                 <TapSafeButton
                  key={member.user_id}
                  type="button"
                   moveThresholdPx={24}
                   minPressTime={60}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUserSelect(member);
                  }}
                  className="p-3 border rounded-lg cursor-pointer hover:bg-accent/50 active:bg-accent transition-colors flex items-center gap-3 w-full text-left select-none"
                 >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-medium">{member.name}</span>
                 </TapSafeButton>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Solicitação</DialogTitle>
            <DialogDescription>
              Uma notificação será enviada para {selectedTargetUser?.name} solicitando que aceite o plantão.
            </DialogDescription>
          </DialogHeader>
          {selectedAssignment && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="font-medium">{selectedAssignment.shift.title}</div>
              <div className="text-sm text-muted-foreground">
                {format(parseDateOnly(selectedAssignment.shift.shift_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedAssignment.shift.start_time.slice(0, 5)} - {selectedAssignment.shift.end_time.slice(0, 5)}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea placeholder="Explique o motivo da troca..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSubmitSwapRequest} disabled={processing} className="flex-1">
              {processing ? 'Enviando...' : 'Enviar Solicitação'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
