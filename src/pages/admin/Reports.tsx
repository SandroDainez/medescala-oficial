import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { FileSpreadsheet, Download, Plus, Calendar, UserMinus, MapPin, Check, X, Clock, FileText, Filter, Users, Building2, LogIn, LogOut, Trash2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Absence {
  id: string;
  user_id: string;
  user_name: string;
  type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

interface Sector {
  id: string;
  name: string;
  checkin_enabled: boolean;
  require_gps_checkin: boolean;
  allowed_checkin_radius_meters: number | null;
  checkin_tolerance_minutes: number;
}

interface CheckinRecord {
  id: string;
  user_id: string;
  user_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_name: string;
  status: string;
  checkin_at: string | null;
  checkout_at: string | null;
  checkin_latitude: number | null;
  checkin_longitude: number | null;
  checkout_latitude: number | null;
  checkout_longitude: number | null;
}

const absenceTypeLabels: Record<string, string> = {
  falta: 'Falta',
  atestado: 'Atestado Médico',
  licenca: 'Licença',
  ferias: 'Férias',
  outro: 'Outro',
};

const absenceStatusLabels: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

export default function AdminReports() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  
  const [reportType, setReportType] = useState('afastamentos');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedSector, setSelectedSector] = useState<string>('all');
  
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Dialog states
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [sectorGpsDialogOpen, setSectorGpsDialogOpen] = useState(false);
  const [sectorToleranceDialogOpen, setSectorToleranceDialogOpen] = useState(false);
  const [selectedAbsence, setSelectedAbsence] = useState<Absence | null>(null);
  const [selectedSectorForGps, setSelectedSectorForGps] = useState<Sector | null>(null);
  
  // New absence form
  const [newAbsence, setNewAbsence] = useState({
    user_id: '',
    type: 'falta',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    notes: '',
  });
  
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (currentTenantId) {
      fetchSectors();
      fetchUsers();
    }
  }, [currentTenantId]);

  useEffect(() => {
    if (currentTenantId && reportType) {
      generateReport();
    }
  }, [currentTenantId, reportType, startDate, endDate, selectedSector]);

  async function fetchSectors() {
    const { data } = await supabase
      .from('sectors')
      .select('id, name, checkin_enabled, require_gps_checkin, allowed_checkin_radius_meters, checkin_tolerance_minutes')
      .eq('tenant_id', currentTenantId)
      .eq('active', true);
    
    if (data) setSectors(data as Sector[]);
  }

  async function fetchUsers() {
    const { data: memberships } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', currentTenantId)
      .eq('active', true);
    
    if (memberships) {
      const userIds = memberships.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      
      if (profiles) {
        setUsers(profiles.map(p => ({ id: p.id, name: p.name || 'Sem nome' })));
      }
    }
  }

  async function generateReport() {
    setLoading(true);
    
    if (reportType === 'afastamentos') {
      await fetchAbsences();
    } else if (reportType === 'checkins') {
      await fetchCheckins();
    }
    
    setLoading(false);
  }

  async function fetchAbsences() {
    const { data, error } = await supabase
      .from('absences')
      .select('*')
      .eq('tenant_id', currentTenantId)
      .gte('start_date', startDate)
      .lte('end_date', endDate)
      .order('start_date', { ascending: false });
    
    if (error) {
      console.error('Error fetching absences:', error);
      return;
    }
    
    if (data) {
      const userIds = [...new Set(data.map(a => a.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p.name]) || []);
      
      setAbsences(data.map(a => ({
        ...a,
        user_name: profileMap.get(a.user_id) || 'Sem nome',
      })));
    }
  }

  async function fetchCheckins() {
    // Primeiro, buscar setores com check-in ativado
    const enabledSectorIds = sectors.filter(s => s.checkin_enabled).map(s => s.id);
    
    if (enabledSectorIds.length === 0) {
      setCheckins([]);
      return;
    }
    
    // Buscar apenas plantões de setores com check-in ativado E que já aconteceram (data <= hoje)
    const today = new Date().toISOString().split('T')[0];
    
    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('id, shift_date, start_time, end_time, sector_id')
      .eq('tenant_id', currentTenantId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate <= today ? endDate : today) // Não mostrar plantões futuros
      .in('sector_id', enabledSectorIds);
    
    if (!shiftsData || shiftsData.length === 0) {
      setCheckins([]);
      return;
    }
    
    const shiftIds = shiftsData.map(s => s.id);
    
    const { data: assignments } = await supabase
      .from('shift_assignments')
      .select(`
        id, user_id, checkin_at, checkout_at,
        checkin_latitude, checkin_longitude,
        checkout_latitude, checkout_longitude,
        shift_id, status
      `)
      .in('shift_id', shiftIds);
    
    if (!assignments) {
      setCheckins([]);
      return;
    }
    
    // Get user names
    const userIds = [...new Set(assignments.map(a => a.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p.name]) || []);
    const shiftMap = new Map(shiftsData.map(s => [s.id, s]));
    const sectorMap = new Map(sectors.map(s => [s.id, s.name]));
    
    const checkinRecords: CheckinRecord[] = assignments
      .filter(a => {
        const shift = shiftMap.get(a.shift_id);
        // Filtrar por setor selecionado (se não for 'all')
        if (selectedSector !== 'all' && shift?.sector_id !== selectedSector) {
          return false;
        }
        return true;
      })
      .map(a => {
        const shift = shiftMap.get(a.shift_id);
        return {
          id: a.id,
          user_id: a.user_id,
          user_name: profileMap.get(a.user_id) || 'Sem nome',
          shift_date: shift?.shift_date || '',
          start_time: shift?.start_time || '',
          end_time: shift?.end_time || '',
          sector_name: shift?.sector_id ? sectorMap.get(shift.sector_id) || 'Sem setor' : 'Sem setor',
          status: a.status || 'assigned',
          checkin_at: a.checkin_at,
          checkout_at: a.checkout_at,
          checkin_latitude: a.checkin_latitude,
          checkin_longitude: a.checkin_longitude,
          checkout_latitude: a.checkout_latitude,
          checkout_longitude: a.checkout_longitude,
        };
      })
      .sort((a, b) => b.shift_date.localeCompare(a.shift_date)); // Ordenar por data mais recente
    
    setCheckins(checkinRecords);
  }

  async function handleCreateAbsence() {
    if (!newAbsence.user_id || !newAbsence.type || !newAbsence.start_date) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }
    
    const { error } = await supabase
      .from('absences')
      .insert({
        tenant_id: currentTenantId,
        user_id: newAbsence.user_id,
        type: newAbsence.type,
        start_date: newAbsence.start_date,
        end_date: newAbsence.end_date || newAbsence.start_date,
        reason: newAbsence.reason || null,
        notes: newAbsence.notes || null,
        status: 'approved', // Admin creates as approved
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        created_by: user?.id,
      });
    
    if (error) {
      toast({ title: 'Erro ao criar ausência', description: error.message, variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Ausência registrada com sucesso' });
    setAbsenceDialogOpen(false);
    setNewAbsence({
      user_id: '',
      type: 'falta',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: format(new Date(), 'yyyy-MM-dd'),
      reason: '',
      notes: '',
    });
    fetchAbsences();
  }

  async function handleUpdateAbsenceStatus(absenceId: string, status: string) {
    const { error } = await supabase
      .from('absences')
      .update({
        status,
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq('id', absenceId);
    
    if (error) {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
      return;
    }
    
    toast({ title: `Ausência ${status === 'approved' ? 'aprovada' : 'rejeitada'}` });
    fetchAbsences();
  }

  async function handleToggleSectorCheckin(sector: Sector) {
    const { error } = await supabase
      .from('sectors')
      .update({
        checkin_enabled: !sector.checkin_enabled,
        updated_by: user?.id,
      })
      .eq('id', sector.id);
    
    if (error) {
      toast({ title: 'Erro ao atualizar setor', variant: 'destructive' });
      return;
    }
    
    toast({ title: `Check-in ${!sector.checkin_enabled ? 'ativado' : 'desativado'} para ${sector.name}` });
    fetchSectors();
  }

  async function handleToggleSectorGps(sector: Sector) {
    const { error } = await supabase
      .from('sectors')
      .update({
        require_gps_checkin: !sector.require_gps_checkin,
        updated_by: user?.id,
      })
      .eq('id', sector.id);
    
    if (error) {
      toast({ title: 'Erro ao atualizar setor', variant: 'destructive' });
      return;
    }
    
    toast({ title: `GPS ${!sector.require_gps_checkin ? 'ativado' : 'desativado'} para ${sector.name}` });
    fetchSectors();
  }

  async function handleUpdateSectorRadius(sectorId: string, radius: number) {
    const { error } = await supabase
      .from('sectors')
      .update({
        allowed_checkin_radius_meters: radius,
        updated_by: user?.id,
      })
      .eq('id', sectorId);
    
    if (error) {
      toast({ title: 'Erro ao atualizar raio', variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Raio de check-in atualizado' });
    setSectorGpsDialogOpen(false);
    fetchSectors();
  }

  // Admin manual check-in/check-out
  async function handleAdminCheckin(assignmentId: string) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({
        checkin_at: new Date().toISOString(),
        status: 'confirmed',
        updated_by: user?.id,
      })
      .eq('id', assignmentId);
    
    if (error) {
      toast({ title: 'Erro ao registrar check-in', variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Check-in registrado manualmente' });
    fetchCheckins();
  }

  async function handleAdminCheckout(assignmentId: string) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({
        checkout_at: new Date().toISOString(),
        status: 'completed',
        updated_by: user?.id,
      })
      .eq('id', assignmentId);
    
    if (error) {
      toast({ title: 'Erro ao registrar check-out', variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Check-out registrado manualmente' });
    fetchCheckins();
  }

  async function handleClearCheckin(assignmentId: string) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({
        checkin_at: null,
        checkin_latitude: null,
        checkin_longitude: null,
        checkout_at: null,
        checkout_latitude: null,
        checkout_longitude: null,
        status: 'assigned',
        updated_by: user?.id,
      })
      .eq('id', assignmentId);
    
    if (error) {
      toast({ title: 'Erro ao limpar registros', variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Registros de presença limpos' });
    fetchCheckins();
  }

  function exportToXLS() {
    let csvContent = '';
    
    if (reportType === 'afastamentos') {
      csvContent = 'Plantonista,Tipo,Data Início,Data Fim,Motivo,Status,Observações\n';
      absences.forEach(a => {
        csvContent += `"${a.user_name}","${absenceTypeLabels[a.type] || a.type}","${format(parseISO(a.start_date), 'dd/MM/yyyy')}","${format(parseISO(a.end_date), 'dd/MM/yyyy')}","${a.reason || ''}","${absenceStatusLabels[a.status] || a.status}","${a.notes || ''}"\n`;
      });
    } else if (reportType === 'checkins') {
      csvContent = 'Plantonista,Data,Horário,Setor,Check-in,Check-out,GPS Check-in,GPS Check-out\n';
      checkins.forEach(c => {
        const gpsIn = c.checkin_latitude ? `${c.checkin_latitude},${c.checkin_longitude}` : 'N/A';
        const gpsOut = c.checkout_latitude ? `${c.checkout_latitude},${c.checkout_longitude}` : 'N/A';
        csvContent += `"${c.user_name}","${format(parseISO(c.shift_date), 'dd/MM/yyyy')}","${c.start_time} - ${c.end_time}","${c.sector_name}","${c.checkin_at ? format(parseISO(c.checkin_at), 'HH:mm') : 'Não registrado'}","${c.checkout_at ? format(parseISO(c.checkout_at), 'HH:mm') : 'Não registrado'}","${gpsIn}","${gpsOut}"\n`;
      });
    }
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_${reportType}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Relatórios</h1>
          <p className="text-muted-foreground">Relatórios gerenciais e financeiros</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros do Relatório
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Tipo de Relatório</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="afastamentos">Afastamentos</SelectItem>
                  <SelectItem value="checkins">Check-ins/Check-outs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {reportType === 'checkins' && (
              <div className="space-y-2">
                <Label>Setor (com check-in ativo)</Label>
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos com check-in ativo</SelectItem>
                    {sectors.filter(s => s.checkin_enabled).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sectors.filter(s => s.checkin_enabled).length === 0 && (
                  <p className="text-xs text-destructive">
                    Nenhum setor com check-in ativo. Ative na aba "Configurar Check-in".
                  </p>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            
            <div className="flex items-end gap-2">
              <Button onClick={generateReport} className="flex-1">
                <FileText className="mr-2 h-4 w-4" />
                Gerar
              </Button>
              <Button variant="outline" onClick={exportToXLS}>
                <Download className="mr-2 h-4 w-4" />
                XLS
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="report" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="report">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Relatório
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Clock className="mr-2 h-4 w-4" />
            Pendentes
          </TabsTrigger>
          <TabsTrigger value="absences">
            <UserMinus className="mr-2 h-4 w-4" />
            Ausências
          </TabsTrigger>
          <TabsTrigger value="gps">
            <MapPin className="mr-2 h-4 w-4" />
            Configurar GPS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {reportType === 'afastamentos' ? 'Relatório de Afastamentos' : 'Relatório de Check-ins'}
              </CardTitle>
              <Badge variant="secondary">
                {reportType === 'afastamentos' ? absences.length : checkins.length} registros
              </Badge>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : reportType === 'afastamentos' ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plantonista</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Observações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {absences.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            Nenhum afastamento encontrado no período
                          </TableCell>
                        </TableRow>
                      ) : (
                        absences.map(absence => (
                          <TableRow key={absence.id}>
                            <TableCell className="font-medium">{absence.user_name}</TableCell>
                            <TableCell>
                              <Badge variant={absence.type === 'falta' ? 'destructive' : 'secondary'}>
                                {absenceTypeLabels[absence.type] || absence.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {format(parseISO(absence.start_date), 'dd/MM/yyyy')}
                              {absence.start_date !== absence.end_date && (
                                <> a {format(parseISO(absence.end_date), 'dd/MM/yyyy')}</>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{absence.reason || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={
                                absence.status === 'approved' ? 'default' :
                                absence.status === 'rejected' ? 'destructive' : 'secondary'
                              }>
                                {absenceStatusLabels[absence.status] || absence.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">{absence.notes || '-'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plantonista</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Horário</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Check-out</TableHead>
                        <TableHead>GPS</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checkins.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            Nenhum registro de check-in encontrado no período
                          </TableCell>
                        </TableRow>
                      ) : (
                        checkins.map(checkin => (
                          <TableRow key={checkin.id}>
                            <TableCell className="font-medium">{checkin.user_name}</TableCell>
                            <TableCell>{format(parseISO(checkin.shift_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell>{checkin.start_time?.slice(0, 5)} - {checkin.end_time?.slice(0, 5)}</TableCell>
                            <TableCell>{checkin.sector_name}</TableCell>
                            <TableCell>
                              {checkin.checkin_at ? (
                                <Badge variant="default" className="gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(parseISO(checkin.checkin_at), 'HH:mm')}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Não registrado</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {checkin.checkout_at ? (
                                <Badge variant="default" className="gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(parseISO(checkin.checkout_at), 'HH:mm')}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Não registrado</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {checkin.checkin_latitude ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(`https://maps.google.com/?q=${checkin.checkin_latitude},${checkin.checkin_longitude}`, '_blank')}
                                >
                                  <MapPin className="h-4 w-4 text-primary" />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {!checkin.checkin_at && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAdminCheckin(checkin.id)}
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                    title="Registrar check-in manual"
                                  >
                                    <LogIn className="h-4 w-4" />
                                  </Button>
                                )}
                                {checkin.checkin_at && !checkin.checkout_at && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAdminCheckout(checkin.id)}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    title="Registrar check-out manual"
                                  >
                                    <LogOut className="h-4 w-4" />
                                  </Button>
                                )}
                                {checkin.checkin_at && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleClearCheckin(checkin.id)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    title="Limpar registros de presença"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="absences">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserMinus className="h-5 w-5" />
                Gerenciar Ausências
              </CardTitle>
              <Button onClick={() => setAbsenceDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Ausência
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plantonista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absences.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhuma ausência registrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      absences.map(absence => (
                        <TableRow key={absence.id}>
                          <TableCell className="font-medium">{absence.user_name}</TableCell>
                          <TableCell>
                            <Badge variant={absence.type === 'falta' ? 'destructive' : 'secondary'}>
                              {absenceTypeLabels[absence.type] || absence.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(parseISO(absence.start_date), 'dd/MM/yyyy')}
                            {absence.start_date !== absence.end_date && (
                              <> a {format(parseISO(absence.end_date), 'dd/MM/yyyy')}</>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{absence.reason || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={
                              absence.status === 'approved' ? 'default' :
                              absence.status === 'rejected' ? 'destructive' : 'secondary'
                            }>
                              {absenceStatusLabels[absence.status] || absence.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {absence.status === 'pending' && (
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateAbsenceStatus(absence.id, 'approved')}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateAbsenceStatus(absence.id, 'rejected')}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Plantões Sem Check-in
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Lista de plantonistas que não realizaram check-in nos plantões do período selecionado.
              </p>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plantonista</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Horário Previsto</TableHead>
                      <TableHead>Setor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checkins.filter(c => !c.checkin_at).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Todos os plantonistas do período fizeram check-in
                        </TableCell>
                      </TableRow>
                    ) : (
                      checkins.filter(c => !c.checkin_at).map(checkin => (
                        <TableRow key={checkin.id} className="bg-yellow-50/50">
                          <TableCell className="font-medium">{checkin.user_name}</TableCell>
                          <TableCell>{format(parseISO(checkin.shift_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>{checkin.start_time?.slice(0, 5)} - {checkin.end_time?.slice(0, 5)}</TableCell>
                          <TableCell>{checkin.sector_name}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">Sem check-in</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAdminCheckin(checkin.id)}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <LogIn className="mr-2 h-4 w-4" />
                              Check-in Manual
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gps">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Configurar Check-in por Setor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Ative o controle de check-in/check-out, GPS e tolerância para os setores desejados.
                <br />
                <span className="text-xs">Alertas são enviados: 15 min antes, na hora e 15 min depois do início. Após a tolerância, o plantonista é marcado como ausente.</span>
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setor</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>GPS</TableHead>
                    <TableHead>Raio</TableHead>
                    <TableHead>Tolerância</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectors.map(sector => (
                    <TableRow key={sector.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {sector.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sector.checkin_enabled ? 'default' : 'secondary'}>
                          {sector.checkin_enabled ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sector.require_gps_checkin ? 'default' : 'secondary'}>
                          {sector.require_gps_checkin ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {sector.require_gps_checkin ? (
                          <span>{sector.allowed_checkin_radius_meters || 500}m</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sector.checkin_enabled ? (
                          <span>{sector.checkin_tolerance_minutes || 30} min</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Button
                            variant={sector.checkin_enabled ? 'destructive' : 'default'}
                            size="sm"
                            onClick={() => handleToggleSectorCheckin(sector)}
                          >
                            {sector.checkin_enabled ? 'Desativar' : 'Ativar'}
                          </Button>
                          {sector.checkin_enabled && (
                            <>
                              <Button
                                variant={sector.require_gps_checkin ? 'secondary' : 'outline'}
                                size="sm"
                                onClick={() => handleToggleSectorGps(sector)}
                              >
                                GPS {sector.require_gps_checkin ? 'On' : 'Off'}
                              </Button>
                              {sector.require_gps_checkin && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedSectorForGps(sector);
                                    setSectorGpsDialogOpen(true);
                                  }}
                                >
                                  {sector.allowed_checkin_radius_meters || 500}m
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedSectorForGps(sector);
                                  setSectorToleranceDialogOpen(true);
                                }}
                              >
                                {sector.checkin_tolerance_minutes || 30}min
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Nova Ausência */}
      <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Nova Ausência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Plantonista *</Label>
              <Select value={newAbsence.user_id} onValueChange={(v) => setNewAbsence({ ...newAbsence, user_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o plantonista" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={newAbsence.type} onValueChange={(v) => setNewAbsence({ ...newAbsence, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="falta">Falta</SelectItem>
                  <SelectItem value="atestado">Atestado Médico</SelectItem>
                  <SelectItem value="licenca">Licença</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Início *</Label>
                <Input
                  type="date"
                  value={newAbsence.start_date}
                  onChange={(e) => setNewAbsence({ ...newAbsence, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Fim</Label>
                <Input
                  type="date"
                  value={newAbsence.end_date}
                  onChange={(e) => setNewAbsence({ ...newAbsence, end_date: e.target.value })}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input
                value={newAbsence.reason}
                onChange={(e) => setNewAbsence({ ...newAbsence, reason: e.target.value })}
                placeholder="Motivo da ausência"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={newAbsence.notes}
                onChange={(e) => setNewAbsence({ ...newAbsence, notes: e.target.value })}
                placeholder="Observações adicionais"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbsenceDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateAbsence}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Configurar Raio GPS */}
      <Dialog open={sectorGpsDialogOpen} onOpenChange={setSectorGpsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Raio de Check-in</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Define o raio máximo (em metros) permitido para realizar o check-in no setor <strong>{selectedSectorForGps?.name}</strong>.
            </p>
            <div className="space-y-2">
              <Label>Raio em metros</Label>
              <Input
                type="number"
                defaultValue={selectedSectorForGps?.allowed_checkin_radius_meters || 500}
                id="radius-input"
                min={50}
                max={5000}
                step={50}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectorGpsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              const input = document.getElementById('radius-input') as HTMLInputElement;
              if (selectedSectorForGps && input) {
                handleUpdateSectorRadius(selectedSectorForGps.id, parseInt(input.value));
              }
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Configurar Tolerância */}
      <Dialog open={sectorToleranceDialogOpen} onOpenChange={setSectorToleranceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Tolerância de Check-in</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Define o tempo máximo (em minutos) após o início do plantão para realizar o check-in no setor <strong>{selectedSectorForGps?.name}</strong>.
              <br /><br />
              Após esse período sem check-in, o plantonista será automaticamente marcado como <strong>ausente</strong>.
            </p>
            <div className="space-y-2">
              <Label>Tolerância em minutos</Label>
              <Input
                type="number"
                defaultValue={selectedSectorForGps?.checkin_tolerance_minutes || 30}
                id="tolerance-input"
                min={5}
                max={120}
                step={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectorToleranceDialogOpen(false)}>Cancelar</Button>
            <Button onClick={async () => {
              const input = document.getElementById('tolerance-input') as HTMLInputElement;
              if (selectedSectorForGps && input) {
                const { error } = await supabase
                  .from('sectors')
                  .update({
                    checkin_tolerance_minutes: parseInt(input.value),
                    updated_by: user?.id,
                  })
                  .eq('id', selectedSectorForGps.id);
                
                if (error) {
                  toast({ title: 'Erro ao atualizar tolerância', variant: 'destructive' });
                } else {
                  toast({ title: 'Tolerância atualizada' });
                  setSectorToleranceDialogOpen(false);
                  fetchSectors();
                }
              }
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
