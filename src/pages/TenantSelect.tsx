import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { setTenantSelectionDoneSafe } from '@/hooks/tenant-context';

export default function TenantSelect() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { memberships, loading: tenantLoading, setCurrentTenant } = useTenant();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || tenantLoading) return;

    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    if (memberships.length === 0) {
      navigate('/onboarding', { replace: true });
      return;
    }

    if (memberships.length === 1) {
      const membership = memberships[0];
      setCurrentTenant(membership.tenant_id);
      setTenantSelectionDoneSafe(true);
      navigate(membership.role === 'admin' || membership.role === 'owner' ? '/admin' : '/app', {
        replace: true,
      });
    }
  }, [authLoading, tenantLoading, user, memberships, navigate, setCurrentTenant]);

  const handleSelectTenant = (tenantId: string, role: 'admin' | 'owner' | 'user') => {
    setCurrentTenant(tenantId);
    setTenantSelectionDoneSafe(true);
    navigate(role === 'admin' || role === 'owner' ? '/admin' : '/app');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  if (authLoading || tenantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold text-foreground">Escolha onde entrar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta está vinculada a mais de um hospital/serviço. Selecione o ambiente que deseja acessar agora.
          </p>
        </div>

        <div className="space-y-3">
          {memberships.map((membership) => {
            const isAdmin = membership.role === 'admin' || membership.role === 'owner';

            return (
              <button
                key={membership.tenant_id}
                type="button"
                onClick={() => handleSelectTenant(membership.tenant_id, membership.role)}
                className="w-full text-left"
              >
                <Card className="transition-colors hover:border-primary/50 hover:bg-accent/20">
                  <CardContent className="flex items-center justify-between gap-4 p-5">
                    <div className="flex items-center gap-4">
                      <div className="rounded-xl bg-primary/10 p-3 text-primary">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{membership.tenant_name}</div>
                        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                          {isAdmin && <Shield className="h-4 w-4 text-primary" />}
                          <span>{isAdmin ? 'Administrador' : 'Profissional'}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center">
          <Button variant="ghost" onClick={handleSignOut}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
