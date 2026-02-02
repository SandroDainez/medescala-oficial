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
import { Calendar, Download, Share2, X, Bell } from 'lucide-react';
import { useWebCalendarSync } from '@/hooks/useWebCalendarSync';
import { toast } from 'sonner';

const PROMPT_SESSION_KEY = 'medescala-calendar-prompt-shown';
const PROMPT_DISMISSED_KEY = 'medescala-calendar-prompt-dismissed';

interface CalendarSyncPromptProps {
  /** Force show even if dismissed before */
  forceShow?: boolean;
}

export function CalendarSyncPrompt({ forceShow = false }: CalendarSyncPromptProps) {
  const [open, setOpen] = useState(false);
  const { hasShifts, shiftsChanged, loading, exportToCalendar, downloadCalendar, lastExportedAt } = useWebCalendarSync();

  useEffect(() => {
    if (loading) return;

    // Check if we should show the prompt
    const sessionShown = sessionStorage.getItem(PROMPT_SESSION_KEY);
    const permanentlyDismissed = localStorage.getItem(PROMPT_DISMISSED_KEY);

    // Show prompt if:
    // 1. forceShow is true, OR
    // 2. Has shifts AND (never exported OR shifts changed) AND not shown this session AND not permanently dismissed
    const shouldShow = forceShow || (
      hasShifts &&
      (shiftsChanged || !lastExportedAt) &&
      !sessionShown &&
      !permanentlyDismissed
    );

    if (shouldShow) {
      // Small delay so it doesn't feel abrupt
      const timer = setTimeout(() => {
        setOpen(true);
        sessionStorage.setItem(PROMPT_SESSION_KEY, 'true');
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [loading, hasShifts, shiftsChanged, lastExportedAt, forceShow]);

  const handleExport = async () => {
    const shared = await exportToCalendar();
    if (shared) {
      toast.success('Arquivo de calendário compartilhado!');
    } else {
      toast.success('Arquivo de calendário baixado!');
    }
    setOpen(false);
  };

  const handleDownload = () => {
    downloadCalendar();
    toast.success('Arquivo de calendário baixado! Abra-o para adicionar ao seu calendário.');
    setOpen(false);
  };

  const handleDismiss = () => {
    setOpen(false);
  };

  const handleDontAskAgain = () => {
    localStorage.setItem(PROMPT_DISMISSED_KEY, 'true');
    setOpen(false);
  };

  if (!hasShifts) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {shiftsChanged && lastExportedAt
              ? 'Escala atualizada!'
              : 'Adicionar ao calendário?'}
          </DialogTitle>
          <DialogDescription>
            {shiftsChanged && lastExportedAt
              ? 'Seus plantões foram atualizados desde a última exportação. Deseja atualizar seu calendário?'
              : 'Você tem plantões agendados. Deseja adicioná-los ao calendário do seu celular para receber lembretes?'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Benefícios</p>
              <ul className="text-muted-foreground mt-1 space-y-1">
                <li>• Lembretes automáticos do celular</li>
                <li>• Veja plantões no seu calendário</li>
                <li>• Funciona offline</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex gap-2 w-full">
            <Button onClick={handleExport} className="flex-1">
              <Share2 className="h-4 w-4 mr-2" />
              Compartilhar
            </Button>
            <Button onClick={handleDownload} variant="outline" className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Baixar
            </Button>
          </div>
          <div className="flex gap-2 w-full">
            <Button onClick={handleDismiss} variant="ghost" size="sm" className="flex-1">
              Agora não
            </Button>
            <Button onClick={handleDontAskAgain} variant="ghost" size="sm" className="flex-1 text-muted-foreground">
              <X className="h-3 w-3 mr-1" />
              Não perguntar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 
 * Reset the "don't ask again" preference (useful for settings)
 */
export function resetCalendarPromptPreference() {
  localStorage.removeItem(PROMPT_DISMISSED_KEY);
  sessionStorage.removeItem(PROMPT_SESSION_KEY);
}
