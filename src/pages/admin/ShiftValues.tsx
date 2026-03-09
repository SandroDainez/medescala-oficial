import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { Calendar, DollarSign, RefreshCw, UserCog } from 'lucide-react';
import SectorValuesDialog from '@/components/admin/SectorValuesDialog';
import UserSectorValuesDialog from '@/components/admin/UserSectorValuesDialog';

interface Sector {
  id: string;
  name: string;
  color: string;
  default_day_value?: number | null;
  default_night_value?: number | null;
}

const MONTH_OPTIONS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Fev' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Abr' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Ago' },
  { value: 9, label: 'Set' },
  { value: 10, label: 'Out' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dez' },
];

export default function AdminShiftValues() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  const [loading, setLoading] = useState(true);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [valuesDialogOpen, setValuesDialogOpen] = useState(false);
  const [userValuesDialogOpen, setUserValuesDialogOpen] = useState(false);
  const [selectedSectorForValues, setSelectedSectorForValues] = useState<Sector | null>(null);
  const [selectedSectorForUserValues, setSelectedSectorForUserValues] = useState<Sector | null>(null);
  const [userValuesMonth, setUserValuesMonth] = useState<number>(new Date().getMonth() + 1);
  const [userValuesYear, setUserValuesYear] = useState<number>(new Date().getFullYear());

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const fetchSectors = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);

    const { data } = await supabase
      .from('sectors')
      .select('id, name, color, default_day_value, default_night_value')
      .eq('tenant_id', currentTenantId)
      .order('name');

    setSectors((data ?? []) as Sector[]);
    setLoading(false);
  }, [currentTenantId]);

  useEffect(() => {
    if (currentTenantId) {
      fetchSectors();
    }
  }, [currentTenantId, fetchSectors]);

  useEffect(() => {
    if (!selectedSectorId && sectors.length > 0) {
      setSelectedSectorId(sectors[0].id);
    }
  }, [sectors, selectedSectorId]);

  const selectedSector = sectors.find((s) => s.id === selectedSectorId) ?? null;

  function openValuesDialog() {
    if (!selectedSector) return;
    setSelectedSectorForValues(selectedSector);
    setValuesDialogOpen(true);
  }

  function openUserValuesDialog() {
    if (!selectedSector) return;
    setSelectedSectorForUserValues(selectedSector);
    setUserValuesDialogOpen(true);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <span className="text-muted-foreground">Carregando valores...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page animate-fade-in">
      <div className="page-header mb-0">
        <h1 className="page-title text-2xl">Valores de Plantões</h1>
        <p className="page-description mt-1">
          Configure valores padrão por setor e valores individuais por plantonista.
        </p>
      </div>

      <Card className="card-elevated border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Configuração de Valores
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Setor</Label>
            <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
              <SelectTrigger className="h-10 w-full rounded-xl">
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/70 p-2">
                {sectors.map((sector) => (
                  <SelectItem key={sector.id} value={sector.id}>
                    {sector.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openValuesDialog} disabled={!selectedSector}>
              <DollarSign className="mr-1 h-4 w-4" />
              Valores Padrão
            </Button>
            <Button variant="outline" onClick={openUserValuesDialog} disabled={!selectedSector}>
              <UserCog className="mr-1 h-4 w-4" />
              Valores Individuais
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Mês/Ano dos individuais:</span>
            <Select value={String(userValuesMonth)} onValueChange={(value) => setUserValuesMonth(Number(value))}>
              <SelectTrigger className="h-8 w-[88px] rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/70 p-2">
                {MONTH_OPTIONS.map((month) => (
                  <SelectItem key={month.value} value={String(month.value)}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(userValuesYear)} onValueChange={(value) => setUserValuesYear(Number(value))}>
              <SelectTrigger className="h-8 w-[92px] rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/70 p-2">
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <SectorValuesDialog
        open={valuesDialogOpen}
        onOpenChange={setValuesDialogOpen}
        sector={selectedSectorForValues}
        tenantId={currentTenantId || ''}
        userId={user?.id}
        onSuccess={fetchSectors}
      />

      <UserSectorValuesDialog
        open={userValuesDialogOpen}
        onOpenChange={setUserValuesDialogOpen}
        sector={selectedSectorForUserValues}
        tenantId={currentTenantId || ''}
        userId={user?.id}
        month={userValuesMonth}
        year={userValuesYear}
        onSuccess={fetchSectors}
      />
    </div>
  );
}
