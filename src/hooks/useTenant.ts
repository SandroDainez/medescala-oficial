import { useContext } from 'react';
import { TenantContext } from '@/hooks/tenant-context';

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
