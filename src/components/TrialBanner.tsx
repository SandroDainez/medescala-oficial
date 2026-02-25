import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TrialStatus {
  status: string;
  isUnlimited: boolean;
  trialEndsAt: string | null;
  daysRemaining: number | null;
}

export function TrialBanner() {
  const { currentTenantId } = useTenant();
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);

  useEffect(() => {
    async function fetchTrialStatus() {
      if (!currentTenantId) return;

      const { data } = await supabase
        .rpc('get_tenant_access_status', { _tenant_id: currentTenantId });

      if (data?.[0]) {
        setTrialStatus({
          status: data[0].status,
          isUnlimited: data[0].is_unlimited,
          trialEndsAt: data[0].trial_ends_at,
          daysRemaining: data[0].days_remaining,
        });
      }
    }

    fetchTrialStatus();
  }, [currentTenantId]);

  if (!trialStatus) return null;

  // Don't show for unlimited accounts
  if (trialStatus.isUnlimited) {
    return null;
  }

  // Don't show for active (paid) accounts
  if (trialStatus.status === 'active') {
    return null;
  }

  // Only show for trial accounts
  if (trialStatus.status !== 'trial') {
    return null;
  }

  const daysRemaining = trialStatus.daysRemaining ?? 0;
  const isUrgent = daysRemaining <= 7;
  const isCritical = daysRemaining <= 3;

  return (
    <div 
      className={`px-4 py-2 text-sm flex items-center justify-center gap-2 ${
        isCritical 
          ? 'bg-destructive/10 text-destructive border-b border-destructive/20' 
          : isUrgent 
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b border-amber-500/20'
            : 'bg-primary/5 text-primary border-b border-primary/10'
      }`}
    >
      {isCritical ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Clock className="h-4 w-4" />
      )}
      <span>
        {daysRemaining === 0 
          ? 'Último dia do período de teste!' 
          : daysRemaining === 1 
            ? 'Falta 1 dia para o período de teste expirar' 
            : `Faltam ${daysRemaining} dias para o período de teste expirar`
        }
        {trialStatus.trialEndsAt && (
          <span className="text-muted-foreground ml-1">
            (até {format(new Date(trialStatus.trialEndsAt), "d 'de' MMMM", { locale: ptBR })})
          </span>
        )}
      </span>
    </div>
  );
}
