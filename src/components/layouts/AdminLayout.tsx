import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { TenantSelector } from '@/components/TenantSelector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  ArrowLeftRight, 
  DollarSign,
  LogOut,
  Menu,
  X,
  CreditCard
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/shifts', label: 'Plantões', icon: Calendar },
  { to: '/admin/users', label: 'Usuários', icon: Users },
  { to: '/admin/swaps', label: 'Trocas', icon: ArrowLeftRight },
  { to: '/admin/financial', label: 'Financeiro', icon: DollarSign },
  { to: '/admin/subscription', label: 'Assinatura', icon: CreditCard },
];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const { currentTenantName } = useTenant();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <h1 className="text-xl font-bold text-primary">MedEscala</h1>
            <span className="hidden rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary sm:inline">
              Admin
            </span>
            <TenantSelector />
          </div>
          <div className="flex items-center gap-4">
            {currentTenantName && (
              <span className="hidden text-sm font-medium text-foreground lg:inline">
                {currentTenantName}
              </span>
            )}
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden w-64 border-r bg-card md:block">
          <nav className="flex flex-col gap-1 p-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-16 z-40 bg-background md:hidden">
            <nav className="flex flex-col gap-1 p-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
