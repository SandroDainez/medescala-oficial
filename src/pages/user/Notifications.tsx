import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Bell, Check, CheckCheck, Calendar, ArrowLeftRight, DollarSign, AlertCircle, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getNotificationDestination } from '@/lib/notificationNavigation';
import { shouldAutoDismissResolvedNotification, useUserNotifications } from '@/hooks/useUserNotifications';

export default function UserNotifications() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotifications,
  } = useUserNotifications({
    userId: user?.id,
    tenantId: currentTenantId,
    limit: 200,
  });

  async function handleOpenNotification(notification: (typeof notifications)[number]) {
    if (selectionMode) {
      toggleSelection(notification.id);
      return;
    }

    if (!notification.read_at) {
      await markAsRead(notification.id);
    }

    if (shouldAutoDismissResolvedNotification(notification)) {
      await deleteNotifications([notification.id]);
    }

    const destination = getNotificationDestination(notification);
    if (destination) {
      navigate(destination);
      return;
    }

    navigate('/app/notifications');
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  function selectAll() {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map(n => n.id)));
    }
  }

  function cancelSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    
    setDeleting(true);
    const idsToDelete = Array.from(selectedIds);

    try {
      await deleteNotifications(idsToDelete);
      setSelectedIds(new Set());
      setSelectionMode(false);
      toast({
        title: 'Notificações excluídas',
        description: `${idsToDelete.length} notificação(ões) removida(s).`,
      });
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: error instanceof Error ? error.message : 'Não foi possível excluir as notificações.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'shift':
      case 'assignment':
      case 'offer':
        return <Calendar className="h-5 w-5 text-blue-500" />;
      case 'swap':
      case 'swap_request':
      case 'swap_request_update':
      case 'swap_request_admin':
      case 'swap_request_update_admin':
        return <ArrowLeftRight className="h-5 w-5 text-purple-500" />;
      case 'payment':
        return <DollarSign className="h-5 w-5 text-green-500" />;
      case 'urgent':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'general':
      default:
        return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Notificações</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive">{unreadCount}</Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <Button variant="ghost" size="sm" onClick={cancelSelection}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                <CheckCheck className="h-4 w-4 mr-1" />
                {selectedIds.size === notifications.length ? 'Desmarcar' : 'Todas'}
              </Button>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={deleteSelected}
                disabled={selectedIds.size === 0 || deleting}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir ({selectedIds.size})
              </Button>
            </>
          ) : (
            <>
              {notifications.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setSelectionMode(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Selecionar
                </Button>
              )}
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={() => void markAllAsRead()}>
                  <CheckCheck className="h-4 w-4 mr-2" />
                  Marcar todas
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Nenhuma notificação</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map(notification => (
            <Card
              key={notification.id}
              className={`cursor-pointer transition-colors ${
                notification.read_at ? 'opacity-60' : 'border-primary/30 bg-primary/5'
              } ${selectedIds.has(notification.id) ? 'ring-2 ring-primary' : ''}`}
              onClick={() => {
                void handleOpenNotification(notification);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {selectionMode && (
                    <Checkbox
                      checked={selectedIds.has(notification.id)}
                      onCheckedChange={() => toggleSelection(notification.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                  )}
                  <div className="mt-0.5">
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{notification.title}</p>
                      {!selectionMode && !notification.read_at && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            void markAsRead(notification.id);
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(parseISO(notification.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
