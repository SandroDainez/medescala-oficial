import { useTenant } from '@/hooks/useTenant';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export function TenantSelector() {
  const { currentTenantId, memberships, setCurrentTenant } = useTenant();

  if (memberships.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={currentTenantId || ''} onValueChange={setCurrentTenant}>
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
