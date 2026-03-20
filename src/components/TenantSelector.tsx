import { useTenant } from '@/hooks/useTenant';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { setStoredTenantIdSafe } from '@/hooks/tenant-context';

export function TenantSelector() {
  const { currentTenantId, memberships, setCurrentTenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();

  const handleTenantChange = (tenantId: string) => {
    const membership = memberships.find((m) => m.tenant_id === tenantId);
    if (!membership) return;

    const targetPath =
      membership.role === 'admin' || membership.role === 'owner' ? '/admin' : '/app';
    const currentArea = location.pathname.startsWith('/admin') ? 'admin' : 'app';
    const targetArea = targetPath === '/admin' ? 'admin' : 'app';

    if (currentArea !== targetArea) {
      setStoredTenantIdSafe(tenantId);
      window.location.assign(targetPath);
      return;
    }

    setCurrentTenant(tenantId);
    navigate(targetPath);
  };

  if (memberships.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={currentTenantId || ''} onValueChange={handleTenantChange}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Selecione o hospital" />
        </SelectTrigger>
        <SelectContent>
          {memberships.map((m) => (
            <SelectItem key={m.tenant_id} value={m.tenant_id}>
              {m.tenant_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
