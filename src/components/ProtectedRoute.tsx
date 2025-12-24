import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { currentTenantId, currentRole, loading: tenantLoading, memberships } = useTenant();

  if (authLoading || tenantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If user has no memberships, redirect to onboarding
  if (memberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  // If no tenant selected, this shouldn't happen but handle it
  if (!currentTenantId) {
    return <Navigate to="/onboarding" replace />;
  }

  // Check role if required
  if (requiredRole && currentRole !== requiredRole) {
    if (currentRole === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
