import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { UserLayout } from "@/components/layouts/UserLayout";

import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminShifts from "./pages/admin/Shifts";
import AdminUsers from "./pages/admin/Users";
import AdminSwaps from "./pages/admin/Swaps";
import AdminFinancial from "./pages/admin/Financial";

// User pages
import UserShifts from "./pages/user/Shifts";
import UserSwaps from "./pages/user/Swaps";
import UserFinancial from "./pages/user/Financial";

const queryClient = new QueryClient();

function RoleRedirect() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return <Navigate to="/app" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RoleRedirect />} />
            <Route path="/auth" element={<Auth />} />

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
              <Route path="shifts" element={<AdminShifts />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="swaps" element={<AdminSwaps />} />
              <Route path="financial" element={<AdminFinancial />} />
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
              <Route index element={<UserShifts />} />
              <Route path="swaps" element={<UserSwaps />} />
              <Route path="financial" element={<UserFinancial />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
