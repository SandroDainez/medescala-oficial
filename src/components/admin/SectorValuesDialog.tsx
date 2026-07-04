import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { extractErrorMessage } from '@/lib/errorMessage';
import { isWeekendDate } from '@/lib/financial/valueCalculation';
import { useToast } from '@/hooks/use-toast';
import { Sun, Moon, DollarSign, CalendarDays } from 'lucide-react';

interface Sector {
  id: string;
  name: string;
  color: string;
  default_day_value?: number | null;
  default_night_value?: number | null;
  default_weekend_day_value?: number | null;
  default_weekend_night_value?: number | null;
}

interface SectorValuesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sector: Sector | null;
  tenantId: string;
  userId?: string;
  onSuccess: () => void;
}

export default function SectorValuesDialog({
  open,
  onOpenChange,
  sector,
  tenantId,
  userId,
  onSuccess,
}: SectorValuesDialogProps) {
  const { toast } = useToast();
  const [dayValue, setDayValue] = useState('');
  const [nightValue, setNightValue] = useState('');
  const [weekendDayValue, setWeekendDayValue] = useState('');
  const [weekendNightValue, setWeekendNightValue] = useState('');
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sector) {
      setDayValue(sector.default_day_value?.toString() || '');
      setNightValue(sector.default_night_value?.toString() || '');
      setWeekendDayValue(sector.default_weekend_day_value?.toString() || '');
      setWeekendNightValue(sector.default_weekend_night_value?.toString() || '');
      // Default to applying to existing so Sector -> Escalas -> Financeiro stays consistent.
      setApplyToExisting(true);
      setOverwriteExisting(false);
    }
  }, [sector]);

  const formatCurrency = (value: string) => {
    const num = value.replace(/\D/g, '');
    if (!num) return '';
    const cents = parseInt(num, 10);
    return (cents / 100).toFixed(2).replace('.', ',');
  };

  const parseCurrency = (value: string): number | null => {
    if (!value) return null;
    const num = value.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(num);
    return isNaN(parsed) ? null : parsed;
  };

  const handleCurrencyChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d,]/g, '');
    setter(raw);
  };

  const handleDayValueChange = handleCurrencyChange(setDayValue);
  const handleNightValueChange = handleCurrencyChange(setNightValue);
  const handleWeekendDayValueChange = handleCurrencyChange(setWeekendDayValue);
  const handleWeekendNightValueChange = handleCurrencyChange(setWeekendNightValue);

  const isNightShift = (startTime: string): boolean => {
    const hour = parseInt(startTime.split(':')[0], 10);
    // 19h-7h = noturno
    return hour >= 19 || hour < 7;
  };

  // Calculate duration in hours between start and end time
  const calculateDurationHours = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 12; // Default to 12h
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    let hours = endH - startH;
    const minutes = endM - startM;
    if (hours < 0 || (hours === 0 && minutes < 0)) {
      hours += 24;
    }
    return hours + minutes / 60;
  };

  // Calculate pro-rata value based on shift duration
  // Standard shift is 12 hours, so a 6-hour shift pays half
  const calculateProRataValue = (baseValue: number | null, durationHours: number): number | null => {
    if (baseValue === null || baseValue === 0) return baseValue;
    const STANDARD_HOURS = 12;
    if (durationHours === STANDARD_HOURS) return baseValue;
    return Number(((baseValue / STANDARD_HOURS) * durationHours).toFixed(2));
  };

  // Escolhe o valor base (12h) para um plantão conforme diurno/noturno e fim de semana.
  // Fim de semana usa o valor de FDS; se não preenchido, cai no valor de dia útil.
  const pickBaseValue = (
    startTime: string,
    shiftDate: string,
    dayVal: number | null,
    nightVal: number | null,
    weekendDayVal: number | null,
    weekendNightVal: number | null,
  ): number | null => {
    const night = isNightShift(startTime);
    const weekday = night ? nightVal : dayVal;
    if (isWeekendDate(shiftDate)) {
      const weekend = night ? weekendNightVal : weekendDayVal;
      return weekend ?? weekday;
    }
    return weekday;
  };

  async function handleSave() {
    if (!sector || !tenantId) return;
    setSaving(true);

    const dayVal = parseCurrency(dayValue);
    const nightVal = parseCurrency(nightValue);
    const weekendDayVal = parseCurrency(weekendDayValue);
    const weekendNightVal = parseCurrency(weekendNightValue);

    try {
      // Update sector default values
      const { error: sectorError } = await supabase
        .from('sectors')
        .update({
          default_day_value: dayVal,
          default_night_value: nightVal,
          default_weekend_day_value: weekendDayVal,
          default_weekend_night_value: weekendNightVal,
          updated_by: userId,
        })
        .eq('id', sector.id);

      if (sectorError) throw sectorError;

      // If apply to existing shifts is checked, update shifts.base_value and shift_assignments.assigned_value
      // so the same values flow Escalas -> Financeiro.
      // IMPORTANT: Apply pro-rata based on shift duration (12h standard)
      if (applyToExisting) {
        // 1) Update shifts base_value (by day/night/weekend with pro-rata)
        const { data: shifts, error: shiftsError } = await supabase
          .from('shifts')
          .select('id, start_time, end_time, base_value, shift_date')
          .eq('tenant_id', tenantId)
          .eq('sector_id', sector.id);

        if (shiftsError) throw shiftsError;

        if (shifts && shifts.length > 0) {
          // Padrão: só preenche plantões sem valor (null), preservando ajustes manuais.
          // Se overwriteExisting, recalcula TODOS (sobrescreve valores já definidos).
          const shiftsToUpdate = overwriteExisting
            ? shifts
            : shifts.filter((s: any) => s.base_value === null);
          const shiftUpdates = shiftsToUpdate.map((s: any) => {
            const baseValue = pickBaseValue(s.start_time, s.shift_date, dayVal, nightVal, weekendDayVal, weekendNightVal); // Base 12h value
            const duration = calculateDurationHours(s.start_time, s.end_time);
            const proRataValue = calculateProRataValue(baseValue, duration);
            return supabase
              .from('shifts')
              .update({ base_value: proRataValue, updated_by: userId })
              .eq('id', s.id);
          });
          const results = await Promise.all(shiftUpdates);
          const errors = results.filter((r) => r.error);
          if (errors.length > 0) console.error('Some shift updates failed:', errors);
        }

        // 2) Update assignments assigned_value for this sector (by shift time with pro-rata)
        const { data: assignments, error: fetchError } = await supabase
          .from('shift_assignments')
          .select(`
            id,
            assigned_value,
            shift:shifts!inner(
              id,
              sector_id,
              start_time,
              end_time,
              shift_date
            )
          `)
          .eq('tenant_id', tenantId)
          .eq('shift.sector_id', sector.id);

        if (fetchError) throw fetchError;

        if (assignments && assignments.length > 0) {
          // Padrão: preserva valores manuais (inclusive zero), aplica só onde está null.
          // Se overwriteExisting, recalcula TODAS as atribuições do setor.
          const assignmentsToUpdate = overwriteExisting
            ? assignments
            : assignments.filter((assignment: any) => assignment.assigned_value === null);
          const updates = assignmentsToUpdate.map(async (assignment: any) => {
            const shift = assignment.shift as unknown as { id: string; sector_id: string; start_time: string; end_time: string; shift_date: string };
            const baseValue = pickBaseValue(shift.start_time, shift.shift_date, dayVal, nightVal, weekendDayVal, weekendNightVal); // Base 12h value
            const duration = calculateDurationHours(shift.start_time, shift.end_time);
            const proRataValue = calculateProRataValue(baseValue, duration);

            return supabase.rpc('override_assignment_value', {
              _assignment_id: assignment.id,
              _new_value: proRataValue,
              _performed_by: userId,
              _reason: 'sync_sector_default_values',
            });
          });

          const results = await Promise.all(updates);
          const errors = results.filter((r) => r.error);
          if (errors.length > 0) console.error('Some assignment updates failed:', errors);
        }

        toast({
          title: 'Valores atualizados!',
          description: overwriteExisting
            ? `Valores padrão salvos e recalculados em ${shifts?.length || 0} plantões deste setor (incluindo os de fim de semana).`
            : `Valores padrão salvos e aplicados aos plantões sem valor definido (${shifts?.length || 0} verificados).`,
        });
      } else {
        toast({
          title: 'Valores padrão salvos!',
          description: 'Os novos plantões usarão estes valores automaticamente.',
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: extractErrorMessage(error, 'Não foi possível salvar os valores do setor.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  if (!sector) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: sector.color }}
            />
            Valores do Setor: {sector.name}
          </DialogTitle>
          <DialogDescription>
            Defina os valores padrão para plantões diurnos (7h-19h) e noturnos (19h-7h) deste setor.
            Opcionalmente, defina valores diferenciados para sábados e domingos.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-6 overflow-y-auto py-4 pr-1">
          {/* ===== Dias úteis (seg-sex) ===== */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Dias úteis (segunda a sexta)
            </p>

            {/* Day Value */}
            <div className="space-y-2">
              <Label htmlFor="dayValue" className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-500" />
                Valor Diurno (7h - 19h)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                <Input
                  id="dayValue"
                  value={dayValue}
                  onChange={handleDayValueChange}
                  placeholder="0,00"
                  className="pl-10"
                />
              </div>
            </div>

            {/* Night Value */}
            <div className="space-y-2">
              <Label htmlFor="nightValue" className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-blue-500" />
                Valor Noturno (19h - 7h)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                <Input
                  id="nightValue"
                  value={nightValue}
                  onChange={handleNightValueChange}
                  placeholder="0,00"
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* ===== Fim de semana (sáb/dom) ===== */}
          <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <CalendarDays className="h-4 w-4" />
              Fim de semana (sábado e domingo)
            </p>
            <p className="text-xs text-muted-foreground">
              Se deixar em branco, o fim de semana usa o mesmo valor dos dias úteis.
            </p>

            {/* Weekend Day Value */}
            <div className="space-y-2">
              <Label htmlFor="weekendDayValue" className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-500" />
                Valor Diurno FDS (7h - 19h)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                <Input
                  id="weekendDayValue"
                  value={weekendDayValue}
                  onChange={handleWeekendDayValueChange}
                  placeholder={dayValue ? `Padrão: ${dayValue}` : '0,00'}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Weekend Night Value */}
            <div className="space-y-2">
              <Label htmlFor="weekendNightValue" className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-blue-500" />
                Valor Noturno FDS (19h - 7h)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                <Input
                  id="weekendNightValue"
                  value={weekendNightValue}
                  onChange={handleWeekendNightValueChange}
                  placeholder={nightValue ? `Padrão: ${nightValue}` : '0,00'}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Apply to existing */}
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border">
              <Checkbox
                id="applyToExisting"
                checked={applyToExisting}
                onCheckedChange={(checked) => {
                  const on = checked === true;
                  setApplyToExisting(on);
                  if (!on) setOverwriteExisting(false);
                }}
              />
              <div className="space-y-1">
                <Label htmlFor="applyToExisting" className="cursor-pointer font-medium">
                  Aplicar a plantões existentes
                </Label>
                <p className="text-sm text-muted-foreground">
                  Preenche o valor dos plantões já criados neste setor que ainda estão sem valor definido. Não altera os que já têm valor.
                </p>
              </div>
            </div>

            {applyToExisting && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10">
                <Checkbox
                  id="overwriteExisting"
                  checked={overwriteExisting}
                  onCheckedChange={(checked) => setOverwriteExisting(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="overwriteExisting" className="cursor-pointer font-medium">
                    Recalcular também os plantões que já têm valor
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Sobrescreve o valor de todos os plantões deste setor com o padrão correto por dia/noite e fim de semana. Use isto para atualizar plantões antigos com os novos valores de fim de semana. <strong>Atenção:</strong> valores ajustados manualmente serão substituídos.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <DollarSign className="mr-2 h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Valores'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
