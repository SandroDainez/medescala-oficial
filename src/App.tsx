import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { TenantProvider, useTenant } from "@/hooks/useTenant";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { UserLayout } from "@/components/layouts/UserLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import Auth from "./pages/Auth";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import TrialExpired from "./pages/TrialExpired";
import SuperAdmin from "./pages/SuperAdmin";
import Install from "./pages/Install";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";

// ✅ NOVA PÁGINA (você cria/colou ela antes)
import ForceChangePassword from "./pages/ForceChangePassword";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminCalendar from "./pages/admin/Calendar";
import AdminUsers from "./pages/admin/Users";
import AdminSectors from "./pages/admin/Sectors";
import AdminSwaps from "./pages/admin/Swaps";
import AdminNotifications from "./pages/admin/Notifications";
import AdminOffers from "./pages/admin/Offers";
import AdminFinancial from "./pages/admin/Financial";
import AdminReports from "./pages/admin/Reports";
import AdminSubscription from "./pages/admin/Subscription";
import AdminCheckinReport from "./pages/admin/CheckinReport";

// User pages
import UserCalendar from "./pages/user/Calendar";
import UserShifts from "./pages/user/Shifts";
import UserSwaps from "./pages/user/Swaps";
import UserFinancial from "./pages/user/Financial";
import UserNotifications from "./pages/user/Notifications";
import UserSettings from "./pages/user/Settings";
import UserAbout from "./pages/user/About";
import UserFeedback from "./pages/user/Feedback";
import UserAvailableShifts from "./pages/user/AvailableShifts";

const queryClient = new QueryClient();

/**
 * ✅ Gate global para obrigar troca de senha.
 * Se o usuário estiver logado e tiver must_change_password = true,
 * ele só pode ficar em /trocar-senha (e rotas públicas tipo /auth).
 */
function ForcePasswordGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // Se não está logado, não bloqueia aqui (deixa a ProtectedRoute cuidar)
  if (!user) return <>{children}</>;

  const mustChange = !!(user as any)?.user_metadata?.must_change_password;

  if (mustChange) {
    return <Navigate to="/trocar-senha" replace />;
  }

  return <>{children}</>;
}

/**
 * ✅ Rota protegida simples: exige login.
 * (Sem depender do ProtectedRoute, porque ele exige role em alguns casos.)
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return <>{children}</>;
}

function RoleRedirect() {
  const { user, loading: authLoading } = useAuth();
  const { currentRole, loading: tenantLoading, memberships } = useTenant();

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

  // ✅ Se precisa trocar senha, manda direto
  const mustChange = !!(user as any)?.user_metadata?.must_change_password;
  if (mustChange) {
    return <Navigate to="/trocar-senha" replace />;
  }

  // No memberships - go to onboarding
  if (memberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect based on role
  if (currentRole === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return <Navigate to="/app" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <div>
            <AuthProvider>
              <TenantProvider>
                <ErrorBoundary>
                  <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/home" element={<RoleRedirect />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/change-password" element={<ChangePassword />} />
                    <Route path="/trial-expired" element={<TrialExpired />} />
                    <Route path="/super-admin" element={<SuperAdmin />} />
                    <Route path="/install" element={<Install />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />

                    {/* ✅ NOVA ROTA: troca obrigatória de senha */}
                    <Route
                      path="/trocar-senha"
                      element={
                        <RequireAuth>
                          <ForceChangePassword />
                        </RequireAuth>
                      }
                    />

                    {/* Admin Routes */}
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <ForcePasswordGate>
                            <AdminLayout />
                          </ForcePasswordGate>
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<AdminDashboard />} />
                      <Route path="calendar" element={<AdminCalendar />} />
                      <Route path="calendar/:sectorId" element={<AdminCalendar />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="sectors" element={<AdminSectors />} />
                      <Route path="swaps" element={<AdminSwaps />} />
                      <Route path="offers" element={<AdminOffers />} />
                      <Route path="notifications" element={<AdminNotifications />} />
                      <Route path="financial" element={<AdminFinancial />} />
                      <Route path="reports" element={<AdminReports />} />
                      <Route path="checkins" element={<AdminCheckinReport />} />
                      <Route path="subscription" element={<AdminSubscription />} />
                    </Route>

                    {/* User Routes */}
                    <Route
                      path="/app"
                      element={
                        <ProtectedRoute requiredRole="user">
                          <ForcePasswordGate>
                            <UserLayout />
                          </ForcePasswordGate>
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<UserCalendar />} />
                      <Route path="calendar" element={<UserCalendar />} />
                      <Route path="shifts" element={<UserShifts />} />
                      <Route path="available" element={<UserAvailableShifts />} />
                      <Route path="swaps" element={<UserSwaps />} />
                      <Route path="financial" element={<UserFinancial />} />
                      <Route path="notifications" element={<UserNotifications />} />
                      <Route path="settings" element={<UserSettings />} />
                      <Route path="help" element={<UserAbout />} />
                      <Route path="feedback" element={<UserFeedback />} />
                    </Route>

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </ErrorBoundary>
              </TenantProvider>
            </AuthProvider>
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
