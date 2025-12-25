import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { TenantProvider, useTenant } from "@/hooks/useTenant";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { UserLayout } from "@/components/layouts/UserLayout";

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

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminCalendar from "./pages/admin/Calendar";
import AdminShifts from "./pages/admin/Shifts";
import AdminUsers from "./pages/admin/Users";
import AdminSectors from "./pages/admin/Sectors";
import AdminSwaps from "./pages/admin/Swaps";
import AdminFinancial from "./pages/admin/Financial";
import AdminReports from "./pages/admin/Reports";
import AdminSubscription from "./pages/admin/Subscription";

// User pages
import UserCalendar from "./pages/user/Calendar";
import UserShifts from "./pages/user/Shifts";
import UserSwaps from "./pages/user/Swaps";
import UserFinancial from "./pages/user/Financial";

const queryClient = new QueryClient();

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
  if (currentRole === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return <Navigate to="/app" replace />;
}

function AppRoutes() {
  return (
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

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="calendar" element={<AdminCalendar />} />
        <Route path="shifts" element={<AdminShifts />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="sectors" element={<AdminSectors />} />
        <Route path="swaps" element={<AdminSwaps />} />
        <Route path="financial" element={<AdminFinancial />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="subscription" element={<AdminSubscription />} />
      </Route>

      {/* User Routes */}
      <Route
        path="/app"
        element={
          <ProtectedRoute requiredRole="user">
            <UserLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<UserCalendar />} />
        <Route path="shifts" element={<UserShifts />} />
        <Route path="swaps" element={<UserSwaps />} />
        <Route path="financial" element={<UserFinancial />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <AppRoutes />
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
