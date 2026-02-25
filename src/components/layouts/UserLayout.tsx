import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { TenantSelector } from '@/components/TenantSelector';
import { NotificationBell } from '@/components/NotificationBell';
import { TrialBanner } from '@/components/TrialBanner';
import { ThemeToggleSimple } from '@/components/ThemeToggle';
import { CalendarSyncPrompt } from '@/components/CalendarSyncPrompt';
import { CalendarSyncInitialModal } from '@/components/CalendarSyncInitialModal';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  ListTodo,
  ArrowLeftRight,
  DollarSign,
  LogOut,
  Menu,
  Home,
  Bell,
  Settings,
  HelpCircle,
  MessageSquare,
  Hand,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const mainNavItems = [
  { to: '/app/calendar', label: 'Agenda Geral', icon: CalendarDays },
  { to: '/app/shifts', label: 'Minha Agenda', icon: ListTodo },
  { to: '/app/available', label: 'Anúncios e Candidaturas', icon: Hand },
  { to: '/app/swaps', label: 'Trocas', icon: ArrowLeftRight },
  { to: '/app/notifications', label: 'Notificações', icon: Bell },
  { to: '/app/financial', label: 'Extrato', icon: DollarSign },
  { to: '/app/home', label: 'Painel', icon: Home },
];

const secondaryNavItems = [
  { to: '/app/settings', label: 'Preferências', icon: Settings },
  { to: '/app/help', label: 'Sobre', icon: HelpCircle },
  { to: '/app/feedback', label: 'Feedback', icon: MessageSquare },
];

const bottomNavItems = [
  { to: '/app/calendar', label: 'Todos', icon: CalendarDays },
  { to: '/app/shifts', label: 'Meus Plantões', icon: ListTodo },
  { to: '/app/available', label: 'Anúncios', icon: Hand },
];

export function UserLayout() {
  const { user, signOut } = useAuth();
  const { currentTenantName } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const userInitials = user?.email?.slice(0, 2).toUpperCase() || 'U';
  const userName = profileName || user?.email?.split('@')[0] || 'Usuário';

  const headerTitle = useMemo(() => {
    if (location.pathname.startsWith('/app/calendar')) return 'Agenda Geral';
    if (location.pathname.startsWith('/app/shifts')) return 'Minha Agenda';
    if (location.pathname.startsWith('/app/available')) return 'Plantões Disponíveis';
    if (location.pathname.startsWith('/app/swaps')) return 'Trocas';
    if (location.pathname.startsWith('/app/notifications')) return 'Notificações';
    if (location.pathname.startsWith('/app/financial')) return 'Extrato';
    if (location.pathname === '/app') return 'Agenda Geral';
    return 'MedEscala';
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileName() {
      if (!user?.id) {
        setProfileName(null);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, name')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      const fullName = (data as any)?.full_name?.trim();
      const name = (data as any)?.name?.trim();
      setProfileName(fullName || name || null);
    }

    loadProfileName();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-background">
      <CalendarSyncInitialModal />
      <CalendarSyncPrompt />

      <header className="fixed left-0 right-0 top-0 z-[100] border-b border-border/60 bg-gradient-to-r from-background via-background to-primary/5 backdrop-blur">
        <TrialBanner />
        <div className="flex min-h-[56px] items-center justify-between px-3 sm:px-4">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl border border-transparent touch-manipulation active:scale-95"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="top-[56px] h-[calc(100dvh-56px)] w-[300px] border-r border-border/70 bg-card/95 p-0 backdrop-blur supports-[backdrop-filter]:bg-card/85"
            >
              <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-6 pb-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 border border-primary/40 shadow-sm">
                    <AvatarFallback className="bg-primary/15 text-primary text-lg font-semibold">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{userName}</p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Profissional</p>
                  </div>
                </div>
                {currentTenantName && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs text-muted-foreground">Empresas</p>
                    <TenantSelector />
                  </div>
                )}
              </div>

              <Separator />

              <nav className="flex flex-col p-2">
                {mainNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setSheetOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'mb-1 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-foreground hover:bg-accent/70'
                      )
                    }
                  >
                    <item.icon className="h-4.5 w-4.5" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <Separator />

              <nav className="flex flex-col p-2">
                {secondaryNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSheetOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'mb-1 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-foreground hover:bg-accent/70'
                      )
                    }
                  >
                    <item.icon className="h-4.5 w-4.5" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <Separator />

              <div className="p-2">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-4.5 w-4.5" />
                  Sair
                </button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex-1 text-center">
            <span className="text-[15px] font-semibold text-foreground">{headerTitle}</span>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggleSimple />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full border border-border px-2 text-[11px] font-semibold"
              onClick={() => navigate('/app')}
            >
              HOJE
            </Button>
            <NotificationBell />
          </div>
        </div>
      </header>

      <main
        className="min-h-[100dvh] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-primary/[0.04] via-background to-background"
        style={{
          paddingTop: '56px',
          paddingBottom: 'calc(78px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      <nav className={cn(
        'fixed bottom-0 left-0 right-0 z-[95] border-t border-border/70 bg-card/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur',
        sheetOpen && 'hidden'
      )}>
        <div className="grid grid-cols-3 gap-2">
          {bottomNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className={cn(
                  'flex h-11 items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition-colors',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-accent'
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
