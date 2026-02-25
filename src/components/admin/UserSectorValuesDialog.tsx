import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Sun, Moon, DollarSign, UserCog, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function formatDateYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthRange(month: number, year: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start: formatDateYMD(start), end: formatDateYMD(end) };
}

interface Sector {
  id: string;
  name: string;
  color: string;
  default_day_value?: number | null;
  default_night_value?: number | null;
}

interface Member {
  user_id: string;
  user_name: string;
}

interface UserSectorValue {
  id?: string;
  user_id: string;
  user_name: string;
  day_value: string;
  night_value: string;
  hasOverride: boolean;
}

interface UserSectorValuesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sector: Sector | null;
  tenantId: string;
  userId?: string;
  month: number; // 1-12
  year: number;
  onSuccess: () => void;
}

export default function UserSectorValuesDialog({
  open,
  onOpenChange,
  sector,
  tenantId,
  userId,
  month,
  year,
  onSuccess,
}: UserSectorValuesDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userValues, setUserValues] = useState<UserSectorValue[]>([]);

  const fetchUserValues = useCallback(async () => {
    if (!sector || !tenantId || !month || !year) return;
    setLoading(true);

    try {
      // 1) Get sector member user_ids
      const { data: sectorMemberships, error: sectorMembersError } = await supabase
        .from('sector_memberships')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('sector_id', sector.id);

      if (sectorMembersError) throw sectorMembersError;

      const sectorUserIds = (sectorMemberships || []).map((m) => m.user_id);
      if (sectorUserIds.length === 0) {
        setUserValues([]);
        setLoading(false);
        return;
      }

      // 2) Use RPC function to get member names (bypasses restrictive RLS on profiles)
      const { data: tenantMembers, error: membersError } = await supabase
        .rpc('get_tenant_member_names', { _tenant_id: tenantId });

      if (membersError) throw membersError;

      // Create a map of user_id -> name from the RPC result
      const memberNameMap = new Map<string, string>();
      (tenantMembers || []).forEach((m: { user_id: string; name: string }) => {
        memberNameMap.set(m.user_id, m.name || 'Sem nome');
      });

      // 3) Get memberships to check profile_type (only for sector members)
      const { data: membershipsWithProfiles, error: membershipsError } = await supabase
        .from('memberships')
        .select('user_id, profiles:profiles!memberships_user_id_profiles_fkey(id, profile_type, full_name, name)')
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .in('user_id', sectorUserIds);

      if (membershipsError) {
        console.warn('Could not fetch profile types, using all sector members:', membershipsError.message);
      }

      // Build a set of plantonista user_ids (or fall back to all sector members if profiles failed)
      const plantonistaIds = new Set<string>();
      const profileNameMap = new Map<string, string>();
      if (membershipsWithProfiles && membershipsWithProfiles.length > 0) {
        membershipsWithProfiles.forEach((m: any) => {
          const profile = m.profiles;
          const fullName = profile?.full_name?.trim();
          const shortName = profile?.name?.trim();
          if (fullName || shortName) {
            profileNameMap.set(m.user_id, fullName || shortName);
          }
          // If profile is visible, enforce profile_type.
          // If profile comes back null (common with restrictive RLS), don't hide the user here;
          // otherwise the dialog incorrectly shows "Nenhum plantonista" even when sector has members.
          if (!profile || (profile.profile_type || '') === 'plantonista') plantonistaIds.add(m.user_id);
        });

        // Safety: if we got rows but none qualified (e.g. all profiles hidden), show all sector members.
        if (plantonistaIds.size === 0) sectorUserIds.forEach((id) => plantonistaIds.add(id));
      } else {
      // Fallback: assume all sector members are plantonistas if profile query failed
      sectorUserIds.forEach(id => plantonistaIds.add(id));
    }

      // Filter to only plantonistas and map to Member format
      const members: Member[] = sectorUserIds
        .filter(userId => plantonistaIds.has(userId))
        .map(userId => ({
          user_id: userId,
          user_name: profileNameMap.get(userId) || memberNameMap.get(userId) || 'Sem nome',
        }))
        .sort((a, b) => a.user_name.localeCompare(b.user_name, 'pt-BR'));
      
      if (members.length === 0) {
        setUserValues([]);
        setLoading(false);
        return;
      }

      // Get existing overrides for specific month/year
      const { data: overrides, error: overridesError } = await supabase
        .from('user_sector_values')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('sector_id', sector.id)
        .eq('month', month)
        .eq('year', year);

      if (overridesError) throw overridesError;

      // Map members with their overrides
      const overrideMap = new Map(overrides?.map(o => [o.user_id, o]) || []);
      
      const values: UserSectorValue[] = members.map((m) => {
        const override = overrideMap.get(m.user_id);
        return {
          id: override?.id,
          user_id: m.user_id,
          user_name: m.user_name,
          day_value: override?.day_value?.toString().replace('.', ',') || '',
          night_value: override?.night_value?.toString().replace('.', ',') || '',
          hasOverride: !!override,
        };
      });

      setUserValues(values);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [sector, tenantId, month, year, toast]);

  useEffect(() => {
    if (open && sector && tenantId && month && year) {
      fetchUserValues();
    }
  }, [open, sector, tenantId, month, year, fetchUserValues]);

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

  const handleValueChange = (index: number, field: 'day_value' | 'night_value', rawValue: string) => {
    const cleaned = rawValue.replace(/[^\d,]/g, '');
    setUserValues(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: cleaned };
      return updated;
    });
  };

  async function handleSave() {
    if (!sector || !tenantId) return;
    setSaving(true);

    try {
      // IMPORTANT: Check for explicit values including zero (0 is valid, empty string is not)
      // "0" or "0,00" should be saved as 0, only truly empty values should be skipped
      const operations = userValues
        .filter(uv => {
          const dayParsed = parseCurrency(uv.day_value);
          const nightParsed = parseCurrency(uv.night_value);
          // Include if either value is explicitly set (including zero)
          return dayParsed !== null || nightParsed !== null;
        })
        .map(uv => ({
          tenant_id: tenantId,
          sector_id: sector.id,
          user_id: uv.user_id,
          month: month,
          year: year,
          day_value: parseCurrency(uv.day_value),
          night_value: parseCurrency(uv.night_value),
          updated_by: userId,
          created_by: userId,
        }));

      // Upsert all values (with new unique constraint including month/year)
      if (operations.length > 0) {
        const { error } = await supabase
          .from('user_sector_values')
          .upsert(operations, { onConflict: 'tenant_id,sector_id,user_id,month,year' });

        if (error) throw error;
      }

      // Delete overrides that were truly cleared (both fields empty, not zero)
      const toDelete = userValues.filter(uv => {
        const dayParsed = parseCurrency(uv.day_value);
        const nightParsed = parseCurrency(uv.night_value);
        return uv.hasOverride && dayParsed === null && nightParsed === null;
      });
      for (const uv of toDelete) {
        await supabase
          .from('user_sector_values')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('sector_id', sector.id)
          .eq('user_id', uv.user_id)
          .eq('month', month)
          .eq('year', year);
      }

      // =========================================================
      // Sync Escala: when individual values change, clear assigned_value
      // so the calendar/finance uses the latest individual/default rules.
      // - individual NULL (blank) => falls back to sector default
      // - individual 0 => MUST show 0 (no fallback)
      // =========================================================
      try {
        const affectedUserIds = new Set<string>();
        // users with upserted overrides
        operations.forEach((op) => affectedUserIds.add(op.user_id));
        // users whose overrides were deleted (cleared)
        toDelete.forEach((uv) => affectedUserIds.add(uv.user_id));

        if (affectedUserIds.size > 0) {
          const { start, end } = getMonthRange(month, year);

          const { data: monthShifts, error: shiftsErr } = await supabase
            .from('shifts')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('sector_id', sector.id)
            .gte('shift_date', start)
            .lte('shift_date', end);

          if (!shiftsErr && monthShifts && monthShifts.length > 0) {
            const shiftIds = monthShifts.map((s: any) => s.id);
            const userIdsArr = Array.from(affectedUserIds);

            // Clear assigned_value for affected users in that month/sector.
            // This makes the UI immediately reflect updated individual rates.
            const { error: clearErr } = await supabase
              .from('shift_assignments')
              .update({ assigned_value: null, updated_by: userId || null })
              .in('shift_id', shiftIds)
              .in('user_id', userIdsArr)
              .eq('tenant_id', tenantId);

            if (clearErr) {
              console.warn('Could not clear assigned_value after saving individual values:', clearErr.message);
            }
          }
        }
      } catch (e) {
        console.warn('Sync Escala after saving individual values failed:', e);
      }

      toast({
        title: 'Valores individuais salvos!',
        description: `${operations.length} plantonista(s) com valores personalizados.`,
      });

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
      {/* Use fixed height (not only max-height) so ScrollArea can calculate a viewport and allow scrolling */}
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Valores Individuais: {sector.name}
          </DialogTitle>
          <DialogDescription>
            Mês: <span className="font-semibold text-foreground">{month.toString().padStart(2, '0')}/{year}</span> — Defina valores personalizados por plantonista. Deixe em branco para usar o valor padrão do setor.
          </DialogDescription>
        </DialogHeader>

        {/* Default sector values reference */}
        <div className="flex gap-4 p-3 rounded-lg bg-muted/50 border text-sm">
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-amber-500" />
            <span className="text-muted-foreground">Padrão Diurno:</span>
            <span className="font-medium">
              {sector.default_day_value !== null && sector.default_day_value !== undefined
                ? `R$ ${sector.default_day_value.toFixed(2).replace('.', ',')}`
                : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-blue-500" />
            <span className="text-muted-foreground">Padrão Noturno:</span>
            <span className="font-medium">
              {sector.default_night_value !== null && sector.default_night_value !== undefined
                ? `R$ ${sector.default_night_value.toFixed(2).replace('.', ',')}`
                : '-'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : userValues.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Nenhum plantonista associado a este setor.
          </div>
        ) : (
          <div className="flex-1 min-h-0 -mx-6 px-6">
            <ScrollArea className="h-full">
              <div className="space-y-3 py-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr,120px,120px] gap-3 px-3 text-xs font-medium text-muted-foreground uppercase">
                <span>Plantonista</span>
                <span className="text-center">Diurno</span>
                <span className="text-center">Noturno</span>
              </div>

              {userValues.map((uv, index) => (
                <div 
                  key={uv.user_id} 
                  className={`grid grid-cols-[1fr,120px,120px] gap-3 items-center p-3 rounded-lg border ${
                    uv.day_value || uv.night_value ? 'bg-primary/5 border-primary/20' : 'bg-background'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{uv.user_name}</span>
                    {(uv.day_value || uv.night_value) && (
                      <Badge variant="secondary" className="text-xs">Personalizado</Badge>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      value={uv.day_value}
                      onChange={(e) => handleValueChange(index, 'day_value', e.target.value)}
                      placeholder={sector.default_day_value?.toFixed(2).replace('.', ',') || '0,00'}
                      className="pl-7 text-right h-9 text-sm"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      value={uv.night_value}
                      onChange={(e) => handleValueChange(index, 'night_value', e.target.value)}
                      placeholder={sector.default_night_value?.toFixed(2).replace('.', ',') || '0,00'}
                      className="pl-7 text-right h-9 text-sm"
                    />
                  </div>
                </div>
              ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            <DollarSign className="mr-2 h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Valores'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
