import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Bell, Calendar, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  isNativePlatform, 
  initializePushNotifications,
  getNotificationPreferences,
  saveNotificationPreferences 
} from '@/lib/pushNotifications';
import {
  requestCalendarPermissions,
  syncAllShiftsToCalendar
} from '@/lib/nativeCalendar';

interface NotificationPrefs {
  push_enabled: boolean;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  shift_start_enabled: boolean;
  swap_notifications_enabled: boolean;
  calendar_sync_enabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  push_enabled: true,
  reminder_24h_enabled: true,
  reminder_2h_enabled: true,
  shift_start_enabled: true,
  swap_notifications_enabled: true,
  calendar_sync_enabled: false,
};

export default function NotificationPreferences() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushPermissionGranted, setPushPermissionGranted] = useState<boolean | null>(null);
  const [calendarPermissionGranted, setCalendarPermissionGranted] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);

  const isNative = isNativePlatform();

  useEffect(() => {
    if (user?.id) {
      loadPreferences();
      checkPermissions();
    }
  }, [user?.id]);

  const loadPreferences = async () => {
    if (!user?.id) return;
    
    try {
      const preferences = await getNotificationPreferences(user.id);
      setPrefs(preferences);
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkPermissions = async () => {
    if (!isNative) return;

    try {
      // Check calendar permission by attempting to request it
      const calendarPerm = await requestCalendarPermissions();
      setCalendarPermissionGranted(calendarPerm);
      
      // Push permission check would need Capacitor
      // For now, we'll track it when they try to enable
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  };

  const handlePrefChange = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!user?.id || !currentTenantId) return;

    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    setSaving(true);

    try {
      // Special handling for push_enabled toggle
      if (key === 'push_enabled' && value && isNative) {
        const success = await initializePushNotifications(user.id, currentTenantId);
        if (!success) {
          toast.error('Não foi possível ativar as notificações. Verifique as permissões do app.');
          setPrefs(prefs); // Revert
          setSaving(false);
          return;
        }
        setPushPermissionGranted(true);
      }

      // Special handling for calendar_sync_enabled toggle
      if (key === 'calendar_sync_enabled' && value && isNative) {
        const hasPermission = await requestCalendarPermissions();
        if (!hasPermission) {
          toast.error('Permissão de calendário negada. Ative nas configurações do dispositivo.');
          setPrefs(prefs); // Revert
          setSaving(false);
          return;
        }
        setCalendarPermissionGranted(true);
      }

      const success = await saveNotificationPreferences(user.id, currentTenantId, newPrefs);
      
      if (success) {
        toast.success('Preferências salvas');
      } else {
        toast.error('Erro ao salvar preferências');
        setPrefs(prefs); // Revert on error
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Erro ao salvar preferências');
      setPrefs(prefs); // Revert
    } finally {
      setSaving(false);
    }
  };

  const handleSyncCalendar = async () => {
    if (!user?.id || !currentTenantId) return;

    setSyncing(true);
    try {
      // Fetch user's shifts
      const { data: assignments, error } = await supabase
        .from('shift_assignments')
        .select(`
          id,
          shift_id,
          shifts!inner (
            id,
            title,
            hospital,
            shift_date,
            start_time,
            end_time,
            location,
            notes,
            sectors (
              name
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('tenant_id', currentTenantId)
        .gte('shifts.shift_date', new Date().toISOString().split('T')[0]);

      if (error) throw error;

      if (!assignments || assignments.length === 0) {
        toast.info('Nenhum plantão futuro para sincronizar');
        setSyncing(false);
        return;
      }

      // Transform to the expected format
      const shiftsToSync = assignments.map((a: any) => ({
        id: a.shifts.id,
        title: a.shifts.title,
        hospital: a.shifts.hospital,
        shift_date: a.shifts.shift_date,
        start_time: a.shifts.start_time,
        end_time: a.shifts.end_time,
        location: a.shifts.location,
        sector_name: a.shifts.sectors?.name,
      }));

      const result = await syncAllShiftsToCalendar(shiftsToSync, user.id, currentTenantId);
      
      toast.success(`Calendário sincronizado! ${result.created} novos, ${result.updated} atualizados`);
    } catch (error) {
      console.error('Error syncing calendar:', error);
      toast.error('Erro ao sincronizar calendário');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Push Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações Push
          </CardTitle>
          <CardDescription>
            {isNative 
              ? 'Receba alertas mesmo com o app fechado' 
              : 'Disponível apenas no app móvel'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Ativar notificações</Label>
              <p className="text-sm text-muted-foreground">
                {pushPermissionGranted === false && 'Permissão negada'}
                {pushPermissionGranted === true && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> Ativo
                  </span>
                )}
              </p>
            </div>
            <Switch 
              checked={prefs.push_enabled} 
              onCheckedChange={(v) => handlePrefChange('push_enabled', v)}
              disabled={!isNative || saving}
            />
          </div>

          {prefs.push_enabled && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Lembrete 24h antes</Label>
                  <p className="text-sm text-muted-foreground">Aviso um dia antes do plantão</p>
                </div>
                <Switch 
                  checked={prefs.reminder_24h_enabled} 
                  onCheckedChange={(v) => handlePrefChange('reminder_24h_enabled', v)}
                  disabled={saving}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Lembrete 2h antes</Label>
                  <p className="text-sm text-muted-foreground">Aviso 2 horas antes do plantão</p>
                </div>
                <Switch 
                  checked={prefs.reminder_2h_enabled} 
                  onCheckedChange={(v) => handlePrefChange('reminder_2h_enabled', v)}
                  disabled={saving}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Início do plantão</Label>
                  <p className="text-sm text-muted-foreground">Notificação quando o plantão começa</p>
                </div>
                <Switch 
                  checked={prefs.shift_start_enabled} 
                  onCheckedChange={(v) => handlePrefChange('shift_start_enabled', v)}
                  disabled={saving}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Trocas de plantão</Label>
                  <p className="text-sm text-muted-foreground">Solicitações e respostas de troca</p>
                </div>
                <Switch 
                  checked={prefs.swap_notifications_enabled} 
                  onCheckedChange={(v) => handlePrefChange('swap_notifications_enabled', v)}
                  disabled={saving}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Calendar Sync */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Sincronização com Calendário
          </CardTitle>
          <CardDescription>
            {isNative 
              ? 'Adicione seus plantões ao calendário do celular' 
              : 'Disponível apenas no app móvel'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Sincronização automática</Label>
              <p className="text-sm text-muted-foreground">
                {calendarPermissionGranted === false && (
                  <span className="flex items-center gap-1 text-yellow-600">
                    <AlertCircle className="h-3 w-3" /> Permissão necessária
                  </span>
                )}
                {calendarPermissionGranted === true && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> Calendário conectado
                  </span>
                )}
                {calendarPermissionGranted === null && 'Sincronize plantões automaticamente'}
              </p>
            </div>
            <Switch 
              checked={prefs.calendar_sync_enabled} 
              onCheckedChange={(v) => handlePrefChange('calendar_sync_enabled', v)}
              disabled={!isNative || saving}
            />
          </div>

          {prefs.calendar_sync_enabled && isNative && (
            <>
              <Separator />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSyncCalendar}
                disabled={syncing}
                className="w-full"
              >
                {syncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Sincronizar agora
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Plantões futuros serão adicionados ao seu calendário
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
