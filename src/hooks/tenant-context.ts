import { createContext } from 'react';

export type AppRole = 'admin' | 'user' | 'owner';

export interface Membership {
  tenant_id: string;
  tenant_name: string;
  role: AppRole;
}

export interface TenantContextType {
  currentTenantId: string | null;
  currentTenantName: string | null;
  currentRole: AppRole | null;
  memberships: Membership[];
  loading: boolean;
  setCurrentTenant: (tenantId: string) => void;
  refreshMemberships: () => Promise<void>;
}

export const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TENANT_STORAGE_KEY = 'medescala_current_tenant';

export function getStoredTenantIdSafe(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredTenantIdSafe(tenantId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
  } catch {
    // ignore
  }
}

export function clearStoredTenantIdSafe() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(TENANT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
