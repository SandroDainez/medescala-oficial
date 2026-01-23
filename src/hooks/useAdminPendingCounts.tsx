import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

interface PendingCounts {
  offers: number;
  swaps: number;
}

export function useAdminPendingCounts() {
  const { currentTenantId } = useTenant();
  const [counts, setCounts] = useState<PendingCounts>({ offers: 0, swaps: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentTenantId) {
      fetchCounts();
      
      // Subscribe to changes in shift_offers
      const offersChannel = supabase
        .channel('admin-pending-offers')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shift_offers',
          },
          () => fetchCounts()
        )
        .subscribe();

      // Subscribe to changes in swap_requests
      const swapsChannel = supabase
        .channel('admin-pending-swaps')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'swap_requests',
          },
          () => fetchCounts()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(offersChannel);
        supabase.removeChannel(swapsChannel);
      };
    }
  }, [currentTenantId]);

  async function fetchCounts() {
    if (!currentTenantId) return;
    setLoading(true);

    const [offersRes, swapsRes] = await Promise.all([
      supabase
        .from('shift_offers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', currentTenantId)
        .eq('status', 'pending'),
      supabase
        .from('swap_requests')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', currentTenantId)
        .eq('status', 'pending'),
    ]);

    setCounts({
      offers: offersRes.count || 0,
      swaps: swapsRes.count || 0,
    });
    setLoading(false);
  }

  return { counts, loading, refetch: fetchCounts };
}
