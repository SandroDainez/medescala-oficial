import { useState, useEffect, useCallback } from 'react';
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

  const fetchCounts = useCallback(async () => {
    if (!currentTenantId) return;
    
    try {
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
    } catch (error) {
      console.error('Error fetching pending counts:', error);
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => {
    if (!currentTenantId) return;
    
    // Initial fetch
    fetchCounts();
    
    // Subscribe to changes in shift_offers (all events)
    const offersChannel = supabase
      .channel('admin-pending-offers-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shift_offers',
          filter: `tenant_id=eq.${currentTenantId}`,
        },
        () => {
          // Refetch counts on any change
          fetchCounts();
        }
      )
      .subscribe();

    // Subscribe to changes in swap_requests (all events)
    const swapsChannel = supabase
      .channel('admin-pending-swaps-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'swap_requests',
          filter: `tenant_id=eq.${currentTenantId}`,
        },
        () => {
          // Refetch counts on any change
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(offersChannel);
      supabase.removeChannel(swapsChannel);
    };
  }, [currentTenantId, fetchCounts]);

  return { counts, loading, refetch: fetchCounts };
}
