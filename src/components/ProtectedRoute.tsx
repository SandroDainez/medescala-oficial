import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
}

interface AccessStatus {
  mustChangePassword: boolean;
  isAccessActive: boolean;
  isUnlimited: boolean;
  trialEndsAt: string | null;
  daysRemaining: number | null;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { currentTenantId, currentRole, loading: tenantLoading, memberships } = useTenant();
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    async function checkAccessStatus() {
      if (!user || !currentTenantId) {
        setCheckingStatus(false);
        return;
      }

      try {
        // Check password status
        const { data: profile } = await supabase
          .from('profiles')
          .select('must_change_password')
          .eq('id', user.id)
          .single();

        // Check tenant access status
        const { data: tenantAccess } = await supabase
          .rpc('get_tenant_access_status', { _tenant_id: currentTenantId });

        const accessData = tenantAccess?.[0];

        setAccessStatus({
          mustChangePassword: profile?.must_change_password ?? false,
          isAccessActive: accessData?.is_unlimited || 
            accessData?.status === 'active' || 
            (accessData?.status === 'trial' && (accessData?.days_remaining ?? 0) > 0),
          isUnlimited: accessData?.is_unlimited ?? false,
          trialEndsAt: accessData?.trial_ends_at ?? null,
          daysRemaining: accessData?.days_remaining ?? null,
        });
      } catch (error) {
        console.error('Error checking access status:', error);
        // Default to allowing access on error
        setAccessStatus({
          mustChangePassword: false,
          isAccessActive: true,
          isUnlimited: false,
          trialEndsAt: null,
          daysRemaining: null,
        });
      }

      setCheckingStatus(false);
    }

    if (!authLoading && !tenantLoading && user && currentTenantId) {
      checkAccessStatus();
    } else if (!authLoading && !tenantLoading) {
      setCheckingStatus(false);
    }
  }, [user, currentTenantId, authLoading, tenantLoading]);

  if (authLoading || tenantLoading || checkingStatus) {
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
  if (accessStatus?.mustChangePassword) {
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

  // Check if trial expired
  if (accessStatus && !accessStatus.isAccessActive) {
    return <Navigate to="/trial-expired" replace />;
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
