import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useAdminPendingCounts } from '@/hooks/useAdminPendingCounts';
import { TenantSelector } from '@/components/TenantSelector';
import { TrialBanner } from '@/components/TrialBanner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Stethoscope,
  FileSpreadsheet,
  Shield,
  Bell,
  Hand,
  ChevronDown,
  ChevronRight,
  MapPin
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Sector {
  id: string;
  name: string;
  color: string | null;
}

const navItems = [
  { to: '/admin/users', label: 'Usuários', icon: Users },
  { to: '/admin/sectors', label: 'Setores', icon: Building2 },
  { to: '/admin/swaps', label: 'Trocas', icon: ArrowLeftRight },
  { to: '/admin/offers', label: 'Candidaturas', icon: Hand },
  { to: '/admin/checkins', label: 'Check-ins GPS', icon: MapPin },
  { to: '/admin/notifications', label: 'Notificações', icon: Bell },
  { to: '/admin/financial', label: 'Financeiro', icon: DollarSign },
  { to: '/admin/reports', label: 'Relatórios', icon: FileSpreadsheet },
  { to: '/admin/subscription', label: 'Assinatura', icon: CreditCard },
];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const { currentTenantId, currentTenantName } = useTenant();
  const { isSuperAdmin } = useSuperAdmin();
  const { counts: pendingCounts } = useAdminPendingCounts();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [escalasOpen, setEscalasOpen] = useState(false);

  const fetchSectors = useCallback(async () => {
    if (!currentTenantId) return;
    const { data } = await supabase
      .from('sectors')
      .select('id, name, color')
      .eq('tenant_id', currentTenantId)
      .eq('active', true)
      .order('name');
    if (data) setSectors(data);
  }, [currentTenantId]);

  useEffect(() => {
    // Always start with Escalas collapsed when the app/layout loads or tenant changes
    setEscalasOpen(false);

    if (currentTenantId) {
      fetchSectors();
    }
  }, [currentTenantId, fetchSectors]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Check if current route is a calendar sector route
  const isCalendarRoute = location.pathname.startsWith('/admin/calendar');

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden w-full">
      {/* Header - Fixed with safe-area support */}
      <header className="fixed top-0 left-0 right-0 z-[100] border-b border-border/70 bg-card/90 backdrop-blur-md shadow-sm flex flex-col pt-safe dark:bg-slate-800/85">
        {/* Trial Banner */}
        <TrialBanner />
        <div className="flex min-h-[64px] items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-accent h-11 w-11 touch-manipulation active:scale-95 transition-transform"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
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
            <ThemeToggle />
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

      <div className="flex" style={{ paddingTop: 'calc(64px + env(safe-area-inset-top))' }}>
        {/* Sidebar - Desktop */}
        <aside className="hidden w-64 border-r border-border/70 bg-card/85 backdrop-blur-md md:block dark:bg-slate-800/65">
          <nav 
            className="flex flex-col gap-1 p-4 sticky"
            style={{ top: 'calc(64px + env(safe-area-inset-top))' }}
          >
            {/* Dashboard */}
            <NavLink
              to="/admin"
              end
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-all duration-200',
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
                    'group flex items-center justify-between w-full rounded-md px-4 py-3 text-sm font-medium transition-all duration-200',
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
              <CollapsibleContent className="mt-2 space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                {/* All sectors - card style */}
                <NavLink
                  to="/admin/calendar"
                  end
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-200 border shadow-sm overflow-hidden',
                      isActive
                        ? 'bg-primary/95 text-primary-foreground border-primary shadow-md'
                        : 'bg-card/70 hover:bg-accent/60 border-border/70 hover:border-primary/40 hover:shadow-md dark:bg-slate-700/30 dark:hover:bg-slate-700/50 dark:border-slate-500/30'
                    )
                  }
                >
                  <span className={cn('absolute left-0 top-0 h-full w-1.5 transition-opacity', isCalendarRoute ? 'bg-primary opacity-100' : 'bg-primary/70 opacity-0 group-hover:opacity-100')} />
                  <div className="w-8 h-8 rounded-md bg-muted/80 flex items-center justify-center ring-1 ring-border/70 dark:bg-slate-800/80 dark:ring-slate-400/30">
                    <CalendarDays className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate font-semibold">Todos os Setores</span>
                    <span className="block text-[10px] text-muted-foreground">Visão geral</span>
                  </div>
                </NavLink>
                {/* Individual sectors - card style */}
                {sectors.map((sector) => (
                  <NavLink
                    key={sector.id}
                    to={`/admin/calendar/${sector.id}`}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-200 border shadow-sm overflow-hidden',
                        isActive
                          ? 'bg-primary/95 text-primary-foreground border-primary shadow-md'
                          : 'bg-card/70 hover:bg-accent/60 border-border/70 hover:border-primary/40 hover:shadow-md dark:bg-slate-700/30 dark:hover:bg-slate-700/50 dark:border-slate-500/30'
                      )
                    }
                  >
                    <span className={cn('absolute left-0 top-0 h-full w-1.5 transition-opacity', 'opacity-0 group-hover:opacity-100')} style={{ backgroundColor: sector.color || '#22c55e' }} />
                    <div 
                      className="w-8 h-8 rounded-md flex items-center justify-center shadow-sm ring-1 ring-border/70 dark:ring-slate-400/30"
                      style={{ 
                        backgroundColor: `${sector.color || '#6b7280'}1f`,
                        border: `2px solid ${sector.color || '#6b7280'}`
                      }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: sector.color || '#6b7280' }}
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate font-semibold">{sector.name}</span>
                      <span className="block text-[10px] text-muted-foreground">Setor</span>
                    </div>
                  </NavLink>
                ))}
              </CollapsibleContent>
            </Collapsible>

            {/* Other nav items */}
            {navItems.map((item) => {
              const showBadge = 
                (item.to === '/admin/offers' && pendingCounts.offers > 0) ||
                (item.to === '/admin/swaps' && pendingCounts.swaps > 0);
              const badgeCount = 
                item.to === '/admin/offers' ? pendingCounts.offers : 
                item.to === '/admin/swaps' ? pendingCounts.swaps : 0;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <item.icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <Badge variant="destructive" className="h-5 min-w-5 flex items-center justify-center p-0 text-xs animate-pulse">
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </Badge>
                  )}
                </NavLink>
              );
            })}
            
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
          <div 
            className="fixed inset-x-0 bottom-0 z-[50] bg-background md:hidden animate-fade-in overflow-y-auto"
            style={{ top: 'calc(64px + env(safe-area-inset-top))' }}
          >
            <nav className="flex flex-col gap-1 p-4 pb-safe">
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
                    'flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-all duration-200',
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
                      'flex items-center justify-between w-full rounded-md px-4 py-3 text-sm font-medium transition-all duration-200',
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
                <CollapsibleContent className="mt-2 space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                  <NavLink
                    to="/admin/calendar"
                    end
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-200 border shadow-sm overflow-hidden',
                        isActive
                          ? 'bg-primary/95 text-primary-foreground border-primary shadow-md'
                          : 'bg-card/70 hover:bg-accent/60 border-border/70 hover:border-primary/40 hover:shadow-md dark:bg-slate-700/30 dark:hover:bg-slate-700/50 dark:border-slate-500/30'
                      )
                    }
                  >
                    <span className={cn('absolute left-0 top-0 h-full w-1.5 transition-opacity', isCalendarRoute ? 'bg-primary opacity-100' : 'bg-primary/70 opacity-0 group-hover:opacity-100')} />
                    <div className="w-8 h-8 rounded-md bg-muted/80 flex items-center justify-center ring-1 ring-border/70 dark:bg-slate-800/80 dark:ring-slate-400/30">
                      <CalendarDays className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate font-semibold">Todos os Setores</span>
                      <span className="block text-[10px] text-muted-foreground">Visão geral</span>
                    </div>
                  </NavLink>
                  {sectors.map((sector) => (
                    <NavLink
                      key={sector.id}
                      to={`/admin/calendar/${sector.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-200 border shadow-sm overflow-hidden',
                          isActive
                            ? 'bg-primary/95 text-primary-foreground border-primary shadow-md'
                            : 'bg-card/70 hover:bg-accent/60 border-border/70 hover:border-primary/40 hover:shadow-md dark:bg-slate-700/30 dark:hover:bg-slate-700/50 dark:border-slate-500/30'
                        )
                      }
                    >
                      <span className={cn('absolute left-0 top-0 h-full w-1.5 transition-opacity', 'opacity-0 group-hover:opacity-100')} style={{ backgroundColor: sector.color || '#22c55e' }} />
                      <div 
                        className="w-8 h-8 rounded-md flex items-center justify-center shadow-sm ring-1 ring-border/70 dark:ring-slate-400/30"
                        style={{ 
                          backgroundColor: `${sector.color || '#6b7280'}1f`,
                          border: `2px solid ${sector.color || '#6b7280'}`
                        }}
                      >
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: sector.color || '#6b7280' }}
                        />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate font-semibold">{sector.name}</span>
                        <span className="block text-[10px] text-muted-foreground">Setor</span>
                      </div>
                    </NavLink>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Other nav items - Mobile */}
              {navItems.map((item, index) => {
                const showBadge = 
                  (item.to === '/admin/offers' && pendingCounts.offers > 0) ||
                  (item.to === '/admin/swaps' && pendingCounts.swaps > 0);
                const badgeCount = 
                  item.to === '/admin/offers' ? pendingCounts.offers : 
                  item.to === '/admin/swaps' ? pendingCounts.swaps : 0;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-all duration-200 animate-slide-up',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )
                    }
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="flex-1">{item.label}</span>
                    {showBadge && (
                      <Badge variant="destructive" className="h-5 min-w-5 flex items-center justify-center p-0 text-xs animate-pulse">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </Badge>
                    )}
                  </NavLink>
                );
              })}
              
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
        <main className="flex-1 p-3 md:p-6 lg:p-8 animate-fade-in overflow-x-hidden pb-safe w-full max-w-full">
          <div className="w-full max-w-full overflow-x-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
