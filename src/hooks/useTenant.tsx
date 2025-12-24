import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type AppRole = 'admin' | 'user';

interface Membership {
  tenant_id: string;
  tenant_name: string;
  role: AppRole;
}

interface TenantContextType {
  currentTenantId: string | null;
  currentTenantName: string | null;
  currentRole: AppRole | null;
  memberships: Membership[];
  loading: boolean;
  setCurrentTenant: (tenantId: string) => void;
  refreshMemberships: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const TENANT_STORAGE_KEY = 'medescala_current_tenant';

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMembership = memberships.find(m => m.tenant_id === currentTenantId);

  const fetchMemberships = async () => {
    if (!user) {
      setMemberships([]);
      setCurrentTenantId(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc('get_user_tenants', { _user_id: user.id });

    if (!error && data && data.length > 0) {
      const membershipList = data.map((m: { tenant_id: string; tenant_name: string; role: AppRole }) => ({
        tenant_id: m.tenant_id,
        tenant_name: m.tenant_name,
        role: m.role,
      }));
      setMemberships(membershipList);

      // Restore from localStorage or use first
      const storedTenantId = localStorage.getItem(TENANT_STORAGE_KEY);
      const validTenant = membershipList.find((m: Membership) => m.tenant_id === storedTenantId);
      
      if (validTenant) {
        setCurrentTenantId(validTenant.tenant_id);
      } else {
        setCurrentTenantId(membershipList[0].tenant_id);
        localStorage.setItem(TENANT_STORAGE_KEY, membershipList[0].tenant_id);
      }
    } else {
      setMemberships([]);
      setCurrentTenantId(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchMemberships();
  }, [user]);

  const setCurrentTenant = (tenantId: string) => {
    const membership = memberships.find(m => m.tenant_id === tenantId);
    if (membership) {
      setCurrentTenantId(tenantId);
      localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
    }
  };

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

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
