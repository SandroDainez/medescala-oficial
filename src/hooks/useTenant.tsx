import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type AppRole = "admin" | "user";

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

const TENANT_STORAGE_KEY = "medescala_current_tenant";

function getStoredTenantIdSafe(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredTenantIdSafe(tenantId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
  } catch {
    // ignore
  }
}

function clearStoredTenantIdSafe() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TENANT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMembership = useMemo(
    () => memberships.find((m) => m.tenant_id === currentTenantId),
    [memberships, currentTenantId]
  );

  const fetchMemberships = useCallback(async () => {
    setLoading(true);

    if (!user) {
      setMemberships([]);
      setCurrentTenantId(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("get_user_tenants", {
      _user_id: user.id,
    });

    if (error) {
      console.warn("TenantProvider: get_user_tenants failed:", error);
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
      (m: { tenant_id: string; tenant_name: string; role: AppRole }) => ({
        tenant_id: m.tenant_id,
        tenant_name: m.tenant_name,
        role: m.role,
      })
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
    [memberships]
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

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}