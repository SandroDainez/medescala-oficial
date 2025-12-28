import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Sun, Moon, DollarSign, Users } from 'lucide-react';

interface Sector {
  id: string;
  name: string;
  color: string;
  default_day_value?: number | null;
  default_night_value?: number | null;
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
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sector) {
      setDayValue(sector.default_day_value?.toString() || '');
      setNightValue(sector.default_night_value?.toString() || '');
      // Default to applying to existing so Sector -> Escalas -> Financeiro stays consistent.
      setApplyToExisting(true);
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

  const handleDayValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d,]/g, '');
    setDayValue(raw);
  };

  const handleNightValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d,]/g, '');
    setNightValue(raw);
  };

  const isNightShift = (startTime: string): boolean => {
    const hour = parseInt(startTime.split(':')[0], 10);
    // 19h-7h = noturno
    return hour >= 19 || hour < 7;
  };

  async function handleSave() {
    if (!sector || !tenantId) return;
    setSaving(true);

    const dayVal = parseCurrency(dayValue);
    const nightVal = parseCurrency(nightValue);

    try {
      // Update sector default values
      const { error: sectorError } = await supabase
        .from('sectors')
        .update({
          default_day_value: dayVal,
          default_night_value: nightVal,
          updated_by: userId,
        })
        .eq('id', sector.id);

      if (sectorError) throw sectorError;

      // If apply to existing shifts is checked, update shifts.base_value and shift_assignments.assigned_value
      // so the same values flow Escalas -> Financeiro.
      if (applyToExisting) {
        // 1) Update shifts base_value (by day/night)
        const { data: shifts, error: shiftsError } = await supabase
          .from('shifts')
          .select('id, start_time')
          .eq('tenant_id', tenantId)
          .eq('sector_id', sector.id);

        if (shiftsError) throw shiftsError;

        if (shifts && shifts.length > 0) {
          const shiftUpdates = shifts.map((s) => {
            const isNight = isNightShift(s.start_time);
            const newValue = isNight ? nightVal : dayVal; // can be null or 0
            return supabase
              .from('shifts')
              .update({ base_value: newValue, updated_by: userId })
              .eq('id', s.id);
          });
          const results = await Promise.all(shiftUpdates);
          const errors = results.filter((r) => r.error);
          if (errors.length > 0) console.error('Some shift updates failed:', errors);
        }

        // 2) Update assignments assigned_value for this sector (by shift time)
        const { data: assignments, error: fetchError } = await supabase
          .from('shift_assignments')
          .select(`
            id,
            shift:shifts!inner(
              id,
              sector_id,
              start_time
            )
          `)
          .eq('tenant_id', tenantId)
          .eq('shift.sector_id', sector.id);

        if (fetchError) throw fetchError;

        if (assignments && assignments.length > 0) {
          const updates = assignments.map(async (assignment) => {
            const shift = assignment.shift as unknown as { id: string; sector_id: string; start_time: string };
            const isNight = isNightShift(shift.start_time);
            const newValue = isNight ? nightVal : dayVal; // can be null or 0

            return supabase
              .from('shift_assignments')
              .update({
                assigned_value: newValue,
                updated_by: userId,
              })
              .eq('id', assignment.id);
          });

          const results = await Promise.all(updates);
          const errors = results.filter((r) => r.error);
          if (errors.length > 0) console.error('Some assignment updates failed:', errors);
        }

        toast({
          title: 'Valores atualizados!',
          description: `Valores padrão salvos e aplicados a ${shifts?.length || 0} plantões existentes.`,
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
        description: error.message,
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
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
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

          {/* Apply to existing */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border">
            <Checkbox
              id="applyToExisting"
              checked={applyToExisting}
              onCheckedChange={(checked) => setApplyToExisting(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="applyToExisting" className="cursor-pointer font-medium">
                Aplicar a plantões existentes
              </Label>
              <p className="text-sm text-muted-foreground">
                Atualiza os valores de todos os plantões já criados neste setor que ainda não têm valor individual definido.
              </p>
            </div>
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
