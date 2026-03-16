import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, TenantProvider, ThemeProvider } from "@/providers";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { importWithChunkRecovery } from "@/lib/chunkRecovery";

const lazyRoute = <T,>(loader: () => Promise<T>) => lazy(() => importWithChunkRecovery(loader));

const Landing = lazyRoute(() => import("./pages/Landing"));
const Auth = lazyRoute(() => import("./pages/Auth"));
const Onboarding = lazyRoute(() => import("./pages/Onboarding"));
const NotFound = lazyRoute(() => import("./pages/NotFound"));
const ForgotPassword = lazyRoute(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyRoute(() => import("./pages/ResetPassword"));
const ChangePassword = lazyRoute(() => import("./pages/ChangePassword"));
const TrialExpired = lazyRoute(() => import("./pages/TrialExpired"));
const SuperAdmin = lazyRoute(() => import("./pages/SuperAdmin"));
const Install = lazyRoute(() => import("./pages/Install"));
const Terms = lazyRoute(() => import("./pages/Terms"));
const Privacy = lazyRoute(() => import("./pages/Privacy"));

const AdminLayout = lazyRoute(() =>
  import("./components/layouts/AdminLayout").then((mod) => ({
    default: mod.AdminLayout,
  }))
);
const AdminDashboard = lazyRoute(() => import("./pages/admin/Dashboard"));
const AdminCalendar = lazyRoute(() => import("./pages/admin/Calendar"));
const AdminUsers = lazyRoute(() => import("./pages/admin/Users"));
const AdminSectors = lazyRoute(() => import("./pages/admin/Sectors"));
const AdminShiftValues = lazyRoute(() => import("./pages/admin/ShiftValues"));
const AdminSwaps = lazyRoute(() => import("./pages/admin/Swaps"));
const AdminNotifications = lazyRoute(() => import("./pages/admin/Notifications"));
const AdminOffers = lazyRoute(() => import("./pages/admin/Offers"));
const AdminFinancial = lazyRoute(() => import("./pages/admin/Financial"));
const AdminReports = lazyRoute(() => import("./pages/admin/Reports"));
const AdminSubscription = lazyRoute(() => import("./pages/admin/Subscription"));
const AdminCheckinReport = lazyRoute(() => import("./pages/admin/CheckinReport"));

const UserLayout = lazyRoute(() =>
  import("./components/layouts/UserLayout").then((mod) => ({
    default: mod.UserLayout,
  }))
);
const UserCalendar = lazyRoute(() => import("./pages/user/Calendar"));
const UserHome = lazyRoute(() => import("./pages/user/Home"));
const UserShifts = lazyRoute(() => import("./pages/user/Shifts"));
const UserSwaps = lazyRoute(() => import("./pages/user/Swaps"));
const UserFinancial = lazyRoute(() => import("./pages/user/Financial"));
const UserNotifications = lazyRoute(() => import("./pages/user/Notifications"));
const UserSettings = lazyRoute(() => import("./pages/user/Settings"));
const UserAbout = lazyRoute(() => import("./pages/user/About"));
const UserFeedback = lazyRoute(() => import("./pages/user/Feedback"));
const UserAvailableShifts = lazyRoute(() => import("./pages/user/AvailableShifts"));

function RouteLoadingFallback() {
  const { pathname } = useLocation();

  if (pathname.startsWith("/admin")) {
    const isCalendar = pathname.includes("/admin/calendar");
    const isUsers = pathname.includes("/admin/users");
    const isSectors = pathname.includes("/admin/sectors");
    const isValues = pathname.includes("/admin/values");
    const isFinancial = pathname.includes("/admin/financial");
    const isReports = pathname.includes("/admin/reports");

    return (
      <div className="min-h-screen bg-background">
        <div className="h-16 border-b border-border/70 bg-card/80" />
        <div className="flex">
          <aside className="hidden w-72 border-r border-border/70 bg-card/40 p-4 md:block">
            <div className="space-y-2">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div key={idx} className="h-11 animate-pulse rounded-xl border border-border/70 bg-muted/30" />
              ))}
            </div>
          </aside>
          <main className="flex-1 p-4 md:p-6">
            <div className="mb-4 h-16 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
            {isCalendar ? (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="h-28 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
                  ))}
                </div>
                <div className="h-[480px] animate-pulse rounded-2xl border border-border/70 bg-card/60" />
              </>
            ) : isUsers ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="h-24 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
                ))}
              </div>
            ) : isSectors ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 2 }).map((_, idx) => (
                    <div key={idx} className="h-44 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
                  ))}
                </div>
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="h-20 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
                ))}
              </div>
            ) : isFinancial ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="h-28 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
                  ))}
                </div>
                <div className="h-[420px] animate-pulse rounded-2xl border border-border/70 bg-card/60" />
              </div>
            ) : isValues ? (
              <div className="space-y-3">
                <div className="h-16 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
                <div className="h-56 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
              </div>
            ) : isReports ? (
              <div className="space-y-3">
                <div className="h-24 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
                <div className="h-[460px] animate-pulse rounded-2xl border border-border/70 bg-card/60" />
              </div>
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="h-28 animate-pulse rounded-2xl border border-border/70 bg-card/60" />
                  ))}
                </div>
                <div className="h-[420px] animate-pulse rounded-2xl border border-border/70 bg-card/60" />
              </>
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-muted-foreground">Carregando...</div>
    </div>
  );
}

const queryClient = new QueryClient();

/**
 * Gate global mantido por compatibilidade.
 * A exigência real de troca de senha acontece no ProtectedRoute e usa /change-password
 * como rota canônica para evitar drift entre fluxos duplicados.
 */
function ForcePasswordGate({ children }: { children: React.ReactNode }) {
  // Must-change-password is enforced centrally in ProtectedRoute using profiles.must_change_password.
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

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();

  if (authLoading || saLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/home" replace />;

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

  // No memberships - go to onboarding
  if (memberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect based on role
  if (currentRole === "admin" || currentRole === "owner") {
    return <Navigate to="/admin" replace />;
  }

  return <Navigate to="/app" replace />;
}

function PrefetchDashboardChunks() {
  const { user, loading: authLoading } = useAuth();
  const { currentRole, loading: tenantLoading } = useTenant();

  useEffect(() => {
    if (authLoading || tenantLoading || !user) return;

    if (currentRole === "admin" || currentRole === "owner") {
      void import("./components/layouts/AdminLayout");
      void import("./pages/admin/Dashboard");
      return;
    }

    if (currentRole === "user") {
      void import("./components/layouts/UserLayout");
      void import("./pages/user/Calendar");
    }
  }, [authLoading, tenantLoading, user, currentRole]);

  return null;
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
                  <PrefetchDashboardChunks />
                  <Suspense fallback={<RouteLoadingFallback />}>
                    <Routes>
                      <Route path="/" element={<Landing />} />
                      <Route path="/home" element={<RoleRedirect />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/onboarding" element={<Onboarding />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/change-password" element={<ChangePassword />} />
                      <Route path="/trial-expired" element={<TrialExpired />} />
                      <Route
                        path="/super-admin"
                        element={
                          <RequireSuperAdmin>
                            <SuperAdmin />
                          </RequireSuperAdmin>
                        }
                      />
                      <Route path="/install" element={<Install />} />
                      <Route path="/terms" element={<Terms />} />
                      <Route path="/privacy" element={<Privacy />} />

                      <Route path="/trocar-senha" element={<Navigate to="/change-password" replace />} />

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
                        <Route path="values" element={<AdminShiftValues />} />
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
                        <Route path="home" element={<UserHome />} />
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
                  </Suspense>
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
