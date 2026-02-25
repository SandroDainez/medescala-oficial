import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { isNativePlatform, saveNotificationPreferences } from '@/lib/pushNotifications';
import { requestCalendarPermissions, syncAllShiftsToCalendar } from '@/lib/nativeCalendar';
import { useWebCalendarSync } from '@/hooks/useWebCalendarSync';

/**
 * Modal que aparece na primeira abertura do app perguntando se o usuário
 * deseja sincronizar seus plantões com o calendário do celular.
 */
export function CalendarSyncInitialModal() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const isNative = isNativePlatform();
  const { hasShifts, exportToCalendar } = useWebCalendarSync();
  const loginPromptSessionKey = `medescala-calendar-login-prompt-${user?.id || 'anonymous'}`;

  useEffect(() => {
    if (!user?.id || !currentTenantId) return;

    // Mostra 1x por sessão de login quando houver plantões.
    if (!hasShifts) return;
    if (sessionStorage.getItem(loginPromptSessionKey)) return;

    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(loginPromptSessionKey, 'true');
    }, 1200);

    return () => clearTimeout(timer);
  }, [user?.id, currentTenantId, hasShifts, loginPromptSessionKey]);

  const handleAccept = async () => {
    if (!user?.id || !currentTenantId) return;
    
    setSyncing(true);
    
    try {
      if (isNative) {
        // Plataforma nativa: solicita permissão e sincroniza
        const hasPermission = await requestCalendarPermissions();
        
        if (!hasPermission) {
          toast.error('Permissão de calendário negada. Você pode ativar depois nas configurações.');
          handleDismiss();
          return;
        }
        
        // Busca plantões do usuário
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
              sectors (name)
            )
          `)
          .eq('user_id', user.id)
          .eq('tenant_id', currentTenantId)
          .gte('shifts.shift_date', new Date().toISOString().split('T')[0]);

        if (error) throw error;

        if (assignments && assignments.length > 0) {
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

          await syncAllShiftsToCalendar(shiftsToSync, user.id, currentTenantId);
        }
        
        // Salva preferência
        await saveNotificationPreferences(user.id, currentTenantId, { calendar_sync_enabled: true });
        
        setSuccess(true);
        toast.success('Plantões sincronizados com seu calendário!');
        
      } else {
        // Web: exporta arquivo ICS
        if (hasShifts) {
          const shared = await exportToCalendar();
          if (shared) {
            toast.success('Arquivo de calendário compartilhado!');
          } else {
            toast.success('Arquivo de calendário baixado!');
          }
        } else {
          toast.info('Você ainda não tem plantões para sincronizar.');
        }
        
        setSuccess(true);
      }
      
      // Fecha após mostrar sucesso
      setTimeout(() => {
        setOpen(false);
      }, 1500);
      
    } catch (error) {
      console.error('Error syncing calendar:', error);
      toast.error('Erro ao sincronizar. Tente novamente nas configurações.');
      handleDismiss();
    } finally {
      setSyncing(false);
    }
  };

  const handleDismiss = () => {
    setOpen(false);
  };

  if (!user?.id || !currentTenantId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {success ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Calendário sincronizado!
              </>
            ) : (
              <>
                <Calendar className="h-5 w-5 text-primary" />
                Sincronizar com calendário?
              </>
            )}
          </DialogTitle>
          {!success && (
            <DialogDescription>
              Deseja adicionar seus plantões ao calendário do celular? 
              Assim você receberá lembretes automáticos e nunca perderá um plantão.
            </DialogDescription>
          )}
        </DialogHeader>

        {!success && (
          <>
            <div className="py-4 space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Calendar className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Benefícios</p>
                  <ul className="text-muted-foreground mt-1 space-y-1">
                    <li>• Lembretes automáticos do celular</li>
                    <li>• Veja plantões junto com seus eventos</li>
                    <li>• Atualizações automáticas quando a escala muda</li>
                  </ul>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button 
                onClick={handleAccept} 
                disabled={syncing}
                className="w-full"
              >
                {syncing ? 'Sincronizando...' : 'Aceitar'}
              </Button>
              <Button 
                onClick={handleDismiss} 
                variant="ghost" 
                size="sm" 
                className="w-full"
                disabled={syncing}
              >
                <X className="h-4 w-4 mr-2" />
                Agora não
              </Button>
            </DialogFooter>
          </>
        )}

        {success && (
          <div className="py-4 text-center text-muted-foreground">
            Seus plantões foram adicionados ao calendário.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Reseta a flag para mostrar o modal novamente (útil para testes)
 */
