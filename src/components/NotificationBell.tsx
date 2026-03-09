import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getNotificationDestination } from '@/lib/notificationNavigation';
import { useUserNotifications } from '@/hooks/useUserNotifications';

const typeColors: Record<string, string> = {
  shift: 'bg-blue-500',
  offer: 'bg-blue-500',
  payment: 'bg-green-500',
  swap: 'bg-purple-500',
  swap_request: 'bg-purple-500',
  swap_request_update: 'bg-purple-500',
  swap_request_admin: 'bg-purple-500',
  swap_request_update_admin: 'bg-purple-500',
  urgent: 'bg-red-500',
  general: 'bg-gray-500',
  checkin_reminder_15min: 'bg-blue-500',
  checkin_reminder_now: 'bg-yellow-500',
  checkin_reminder_late: 'bg-orange-500',
  marked_absent: 'bg-red-500',
};

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useUserNotifications({
    userId: user?.id,
    limit: 20,
  });

  async function openNotification(notification: (typeof notifications)[number]) {
    const destination = getNotificationDestination(notification);

    if (!notification.read_at) {
      await markAsRead(notification.id);
    }

    setOpen(false);

    if (destination) {
      navigate(destination);
      return;
    }

    navigate('/app/notifications');
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificações</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto p-1"
              onClick={() => void markAllAsRead()}
            >
              Marcar todas como lidas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${
                  !notification.read_at ? 'bg-accent/50' : ''
                }`}
                onClick={() => {
                  void openNotification(notification);
                }}
              >
                <div className="flex items-center gap-2 w-full">
                  <div className={`w-2 h-2 rounded-full ${typeColors[notification.type] || 'bg-gray-500'}`} />
                  <span className="font-medium text-sm flex-1">{notification.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(notification.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pl-4">{notification.message}</p>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
