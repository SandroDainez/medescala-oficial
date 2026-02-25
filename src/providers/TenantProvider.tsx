import { useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  TenantContext,
  type Membership,
  getStoredTenantIdSafe,
  setStoredTenantIdSafe,
  clearStoredTenantIdSafe,
} from '@/hooks/tenant-context';

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMembership = useMemo(
    () => memberships.find((m) => m.tenant_id === currentTenantId),
    [memberships, currentTenantId],
  );

  const fetchMemberships = useCallback(async () => {
    setLoading(true);

    if (!user) {
      setMemberships([]);
      setCurrentTenantId(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc('get_user_tenants', {
      _user_id: user.id,
    });

    if (error) {
      console.warn('TenantProvider: get_user_tenants failed:', error);
      setMemberships([]);
      setCurrentTenantId(null);
      clearStoredTenantIdSafe();
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setMemberships([]);
      setCurrentTenantId(null);
      clearStoredTenantIdSafe();
      setLoading(false);
      return;
    }

    const membershipList: Membership[] = data.map(
      (m: { tenant_id: string; tenant_name: string; role: 'admin' | 'user' | 'owner' }) => ({
        tenant_id: m.tenant_id,
        tenant_name: m.tenant_name,
        role: m.role,
      }),
    );

    setMemberships(membershipList);

    // Restore from localStorage or use first
    const storedTenantId = getStoredTenantIdSafe();
    const validTenant = storedTenantId
      ? membershipList.find((m) => m.tenant_id === storedTenantId)
      : null;

    const nextTenantId = validTenant
      ? validTenant.tenant_id
      : membershipList[0].tenant_id;

    setCurrentTenantId(nextTenantId);
    setStoredTenantIdSafe(nextTenantId);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await fetchMemberships();
    })();

    return () => {
      alive = false;
    };
  }, [fetchMemberships]);

  const setCurrentTenant = useCallback(
    (tenantId: string) => {
      const membership = memberships.find((m) => m.tenant_id === tenantId);
      if (!membership) return;

      setCurrentTenantId(tenantId);
      setStoredTenantIdSafe(tenantId);
    },
    [memberships],
  );

  return (
    <TenantContext.Provider
      value={{
        currentTenantId,
        currentTenantName: currentMembership?.tenant_name || null,
        currentRole: currentMembership?.role || null,
        memberships,
        loading,
        setCurrentTenant,
        refreshMemberships: fetchMemberships,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}
