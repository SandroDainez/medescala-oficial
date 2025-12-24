import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { currentTenantId, currentRole, loading: tenantLoading, memberships } = useTenant();
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  const [checkingPassword, setCheckingPassword] = useState(true);

  useEffect(() => {
    async function checkPasswordStatus() {
      if (!user) {
        setCheckingPassword(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', user.id)
        .single();

      setMustChangePassword(profile?.must_change_password ?? false);
      setCheckingPassword(false);
    }

    if (!authLoading && user) {
      checkPasswordStatus();
    } else if (!authLoading) {
      setCheckingPassword(false);
    }
  }, [user, authLoading]);

  if (authLoading || tenantLoading || checkingPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user must change password
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
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
