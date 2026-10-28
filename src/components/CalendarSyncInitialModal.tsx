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
import { mensagemDaSincronizacao } from '@/lib/calendarioDoCelular';
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
  const [resumo, setResumo] = useState('');
  
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

        const shiftsToSync = (assignments ?? []).map((a: any) => ({
          id: a.shifts.id,
          title: a.shifts.title,
          hospital: a.shifts.hospital,
          shift_date: a.shifts.shift_date,
          start_time: a.shifts.start_time,
          end_time: a.shifts.end_time,
          location: a.shifts.location,
          sector_name: a.shifts.sectors?.name,
        }));

        const resultado = await syncAllShiftsToCalendar(shiftsToSync, user.id, currentTenantId);
        const { ok, texto } = mensagemDaSincronizacao(resultado, shiftsToSync.length);

        // O "sucesso" era fixo: aparecia mesmo com zero evento gravado.
        if (!ok) {
          toast.error(texto);
          handleDismiss();
          return;
        }

        await saveNotificationPreferences(user.id, currentTenantId, { calendar_sync_enabled: true });

        setSuccess(true);
        setResumo(texto);
        toast.success(texto);

      } else {
        // No navegador não existe acesso ao calendário do aparelho: o que dá
        // para fazer é entregar um arquivo para o médico importar. A tela
        // precisa dizer isso, senão ele espera os plantões aparecerem sozinhos.
        if (hasShifts) {
          const shared = await exportToCalendar();
          const texto = shared
            ? 'Arquivo do calendário gerado. Escolha o app de calendário para importar os plantões.'
            : 'Arquivo do calendário baixado. Abra-o para importar os plantões.';
          setResumo(texto);
          toast.success(texto);
        } else {
          const texto = 'Você ainda não tem plantões futuros para adicionar ao calendário.';
          setResumo(texto);
          toast.info(texto);
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
                {isNative ? 'Calendário sincronizado!' : 'Arquivo pronto'}
              </>
            ) : (
              <>
                <Calendar className="h-5 w-5 text-primary" />
                {isNative ? 'Sincronizar com calendário?' : 'Levar seus plantões para o calendário?'}
              </>
            )}
          </DialogTitle>
          {!success && (
            <DialogDescription>
              {isNative
                ? 'Deseja adicionar seus plantões ao calendário do celular? Assim você receberá lembretes automáticos e nunca perderá um plantão.'
                : 'Pelo navegador, o MedEscala gera um arquivo de calendário com seus plantões. Você o abre no app de calendário do aparelho para importá-los.'}
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
                    {isNative ? (
                      <>
                        <li>• Lembretes 1 dia e 1 hora antes de cada plantão</li>
                        <li>• Veja plantões junto com seus eventos</li>
                        <li>• Atualizações automáticas quando a escala muda</li>
                      </>
                    ) : (
                      <>
                        <li>• Veja plantões junto com seus eventos</li>
                        <li>• Funciona com Google Agenda, Apple Calendário e Outlook</li>
                        <li>• Ao mudar a escala, gere o arquivo de novo nas configurações</li>
                      </>
                    )}
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
                {syncing ? 'Sincronizando...' : isNative ? 'Adicionar ao calendário' : 'Gerar arquivo'}
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
            {resumo}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Reseta a flag para mostrar o modal novamente (útil para testes)
 */
