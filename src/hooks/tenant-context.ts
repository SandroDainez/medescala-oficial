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
export const TENANT_SELECTION_SESSION_KEY = 'medescala_tenant_selection_done';
export const PENDING_INVITE_TENANT_STORAGE_KEY = 'medescala_pending_invite_tenant';
export const PENDING_INVITE_EMAIL_STORAGE_KEY = 'medescala_pending_invite_email';

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

export function getTenantSelectionDoneSafe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(TENANT_SELECTION_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setTenantSelectionDoneSafe(done: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (done) {
      sessionStorage.setItem(TENANT_SELECTION_SESSION_KEY, 'true');
      return;
    }
    sessionStorage.removeItem(TENANT_SELECTION_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function getPendingInviteTenantIdSafe(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(PENDING_INVITE_TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setPendingInviteTenantIdSafe(tenantId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (tenantId) {
      localStorage.setItem(PENDING_INVITE_TENANT_STORAGE_KEY, tenantId);
    } else {
      localStorage.removeItem(PENDING_INVITE_TENANT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function getPendingInviteEmailSafe(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(PENDING_INVITE_EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setPendingInviteEmailSafe(email: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (email) {
      localStorage.setItem(PENDING_INVITE_EMAIL_STORAGE_KEY, email);
    } else {
      localStorage.removeItem(PENDING_INVITE_EMAIL_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearPendingInviteSafe() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_INVITE_TENANT_STORAGE_KEY);
    localStorage.removeItem(PENDING_INVITE_EMAIL_STORAGE_KEY);
  } catch {
    // ignore
  }
}
