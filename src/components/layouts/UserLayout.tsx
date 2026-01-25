import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { TenantSelector } from '@/components/TenantSelector';
import { NotificationBell } from '@/components/NotificationBell';
import { TrialBanner } from '@/components/TrialBanner';
import { ThemeToggleSimple } from '@/components/ThemeToggle';
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
  User,
  Hand
} from 'lucide-react';
import { useState } from 'react';

const mainNavItems = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/calendar', label: 'Agenda Geral', icon: CalendarDays },
  { to: '/app/shifts', label: 'Minha Agenda', icon: ListTodo },
  { to: '/app/available', label: 'Plantões Disponíveis', icon: Hand },
  { to: '/app/swaps', label: 'Trocas', icon: ArrowLeftRight },
  { to: '/app/notifications', label: 'Notificações', icon: Bell },
  { to: '/app/financial', label: 'Extrato', icon: DollarSign },
];

const secondaryNavItems = [
  { to: '/app/settings', label: 'Preferências', icon: Settings },
  { to: '/app/help', label: 'Sobre', icon: HelpCircle },
  { to: '/app/feedback', label: 'Feedback', icon: MessageSquare },
];

export function UserLayout() {
  const { user, signOut } = useAuth();
  const { currentTenantName } = useTenant();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const userInitials = user?.email?.slice(0, 2).toUpperCase() || 'U';
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário';

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden w-full">
      {/* Header - Mobile style like Pega Plantão */}
      <header className="sticky top-0 z-[60] border-b bg-card shadow-sm">
        {/* Trial Banner dentro do header para não interferir */}
        <TrialBanner />
        <div className="flex h-14 items-center justify-between px-4">
          {/* Left: Menu button */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 touch-manipulation active:scale-95 transition-transform"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 bg-card overflow-y-auto max-h-[100dvh] z-[70]">
              {/* Profile section */}
              <div className="p-6 pb-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 border-2 border-muted">
                    <AvatarFallback className="bg-muted text-muted-foreground text-lg">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{userName}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">PROFISSIONAL</p>
                  </div>
                </div>
                {currentTenantName && (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2">Empresas</p>
                    <TenantSelector />
                  </div>
                )}
              </div>

              <Separator />

              {/* Main navigation */}
              <nav className="flex flex-col py-2">
                {mainNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setSheetOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-4 px-6 py-3 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary border-l-4 border-primary'
                          : 'text-foreground hover:bg-accent/50'
                      )
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <Separator />

              {/* Secondary navigation */}
              <nav className="flex flex-col py-2">
                {secondaryNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSheetOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-4 px-6 py-3 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary border-l-4 border-primary'
                          : 'text-foreground hover:bg-accent/50'
                      )
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <Separator />

              {/* Logout */}
              <div className="py-2">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-4 px-6 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 w-full transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  Sair
                </button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Center: Current page or month (will be controlled by child) */}
          <div className="flex-1 text-center">
            <span className="font-semibold text-foreground">MedEscala</span>
          </div>

          {/* Right: Theme toggle, Today button and notifications */}
          <div className="flex items-center gap-1">
            <ThemeToggleSimple />
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-2 text-xs font-medium border border-border"
              onClick={() => navigate('/app')}
            >
              HOJE
            </Button>
            <NotificationBell />
          </div>
        </div>
      </header>

      {/* Main Content - Full height with proper scrolling */}
      <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden pb-safe">
        <div className="w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 lg:px-8 overflow-x-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
