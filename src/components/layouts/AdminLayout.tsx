import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { TenantSelector } from '@/components/TenantSelector';
import { TrialBanner } from '@/components/TrialBanner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  CalendarDays,
  Users, 
  Building2,
  ArrowLeftRight, 
  DollarSign,
  LogOut,
  Menu,
  X,
  CreditCard,
  ListTodo,
  Stethoscope,
  FileSpreadsheet,
  Shield,
  Bell,
  Hand,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

const navItems = [
  { to: '/admin/shifts', label: 'Lista de Plantões', icon: ListTodo },
  { to: '/admin/users', label: 'Usuários', icon: Users },
  { to: '/admin/sectors', label: 'Setores', icon: Building2 },
  { to: '/admin/swaps', label: 'Trocas', icon: ArrowLeftRight },
  { to: '/admin/offers', label: 'Candidaturas', icon: Hand },
  { to: '/admin/notifications', label: 'Notificações', icon: Bell },
  { to: '/admin/financial', label: 'Financeiro', icon: DollarSign },
  { to: '/admin/reports', label: 'Relatórios', icon: FileSpreadsheet },
  { to: '/admin/subscription', label: 'Assinatura', icon: CreditCard },
];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const { currentTenantId, currentTenantName } = useTenant();
  const { isSuperAdmin } = useSuperAdmin();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [escalasOpen, setEscalasOpen] = useState(true);

  useEffect(() => {
    if (currentTenantId) {
      fetchSectors();
    }
  }, [currentTenantId]);

  async function fetchSectors() {
    if (!currentTenantId) return;
    const { data } = await supabase
      .from('sectors')
      .select('id, name, color')
      .eq('tenant_id', currentTenantId)
      .eq('active', true)
      .order('name');
    if (data) setSectors(data);
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Check if current route is a calendar sector route
  const isCalendarRoute = window.location.pathname.startsWith('/admin/calendar');

  return (
    <div className="min-h-screen bg-background">
      {/* Trial Banner */}
      <TrialBanner />
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80">
        <div className="flex h-16 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-accent"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground shadow-primary">
                <Stethoscope className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold text-foreground">
                Med<span className="text-primary">Escala</span>
              </span>
            </div>
            <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary sm:inline-flex items-center gap-1">
              Admin
            </span>
            <div className="hidden md:block">
              <TenantSelector />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {currentTenantName && (
              <span className="hidden text-sm font-medium text-foreground lg:inline px-3 py-1.5 bg-secondary rounded-lg">
                {currentTenantName}
              </span>
            )}
            <span className="hidden text-sm text-muted-foreground sm:inline max-w-[180px] truncate">
              {user?.email}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden w-64 border-r bg-card md:block">
          <nav className="flex flex-col gap-1 p-4 sticky top-16">
            {/* Dashboard */}
            <NavLink
              to="/admin"
              end
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <LayoutDashboard className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              <span>Dashboard</span>
            </NavLink>

            {/* Escalas - Expandable with sectors */}
            <Collapsible open={escalasOpen} onOpenChange={setEscalasOpen}>
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    'group flex items-center justify-between w-full rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                    isCalendarRoute
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                    <span>Escalas</span>
                  </div>
                  {escalasOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4 mt-1 space-y-1">
                {/* All sectors */}
                <NavLink
                  to="/admin/calendar"
                  end
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  <span>Todos os Setores</span>
                </NavLink>
                {/* Individual sectors */}
                {sectors.map((sector) => (
                  <NavLink
                    key={sector.id}
                    to={`/admin/calendar/${sector.id}`}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )
                    }
                  >
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: sector.color || '#6b7280' }}
                    />
                    <span className="truncate">{sector.name}</span>
                  </NavLink>
                ))}
              </CollapsibleContent>
            </Collapsible>

            {/* Other nav items */}
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <item.icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                <span>{item.label}</span>
              </NavLink>
            ))}
            
            {/* Super Admin Link */}
            {isSuperAdmin && (
              <NavLink
                to="/super-admin"
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 mt-4 border-t pt-4',
                    isActive
                      ? 'bg-destructive text-destructive-foreground shadow-md'
                      : 'text-destructive hover:bg-destructive/10'
                  )
                }
              >
                <Shield className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                <span>Super Admin</span>
              </NavLink>
            )}
          </nav>
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-16 z-40 bg-background/95 backdrop-blur-sm md:hidden animate-fade-in">
            <nav className="flex flex-col gap-1 p-4 overflow-y-auto max-h-[calc(100vh-4rem)]">
              <div className="mb-4">
                <TenantSelector />
              </div>

              {/* Dashboard - Mobile */}
              <NavLink
                to="/admin"
                end
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <LayoutDashboard className="h-5 w-5" />
                Dashboard
              </NavLink>

              {/* Escalas - Mobile Expandable */}
              <Collapsible open={escalasOpen} onOpenChange={setEscalasOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      'flex items-center justify-between w-full rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                      isCalendarRoute
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-5 w-5" />
                      <span>Escalas</span>
                    </div>
                    {escalasOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4 mt-1 space-y-1">
                  <NavLink
                    to="/admin/calendar"
                    end
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )
                    }
                  >
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                    <span>Todos os Setores</span>
                  </NavLink>
                  {sectors.map((sector) => (
                    <NavLink
                      key={sector.id}
                      to={`/admin/calendar/${sector.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        )
                      }
                    >
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: sector.color || '#6b7280' }}
                      />
                      <span className="truncate">{sector.name}</span>
                    </NavLink>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Other nav items - Mobile */}
              {navItems.map((item, index) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 animate-slide-up',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              ))}
              
              {/* Super Admin Link - Mobile */}
              {isSuperAdmin && (
                <NavLink
                  to="/super-admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 mt-4 border-t pt-4',
                      isActive
                        ? 'bg-destructive text-destructive-foreground shadow-md'
                        : 'text-destructive hover:bg-destructive/10'
                    )
                  }
                >
                  <Shield className="h-5 w-5" />
                  Super Admin
                </NavLink>
              )}
              
              {/* Logout Button - Mobile */}
              <div className="mt-6 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-3 px-4 truncate">
                  {user?.email}
                </p>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                >
                  <LogOut className="h-5 w-5" />
                  Sair
                </Button>
              </div>
            </nav>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}