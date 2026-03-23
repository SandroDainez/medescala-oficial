import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UserNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  shift_assignment_id: string | null;
  user_id?: string;
  tenant_id?: string | null;
}

export function shouldAutoDismissResolvedNotification(notification: Pick<UserNotification, 'type'>): boolean {
  return (
    notification.type === 'shift' ||
    notification.type === 'swap_request_update' ||
    notification.type === 'swap_request_sent'
  );
}

interface UseUserNotificationsOptions {
  userId?: string;
  tenantId?: string | null;
  limit?: number;
}

function getBaseQueryKey(userId?: string) {
  return ['user-notifications', userId] as const;
}

function getQueryKey(userId?: string, tenantId?: string | null, limit?: number) {
  return ['user-notifications', userId, tenantId ?? 'all', limit ?? 'all'] as const;
}

function upsertNotification(
  notifications: UserNotification[],
  notification: UserNotification,
  limit?: number
) {
  const next = [notification, ...notifications.filter((item) => item.id !== notification.id)].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (!limit) return next;
  return next.slice(0, limit);
}

export function useUserNotifications({
  userId,
  tenantId,
  limit,
}: UseUserNotificationsOptions) {
  const queryClient = useQueryClient();
  const baseQueryKey = getBaseQueryKey(userId);
  const queryKey = getQueryKey(userId, tenantId, limit);

  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return [];

      const queryBuilder = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      const scopedQuery = tenantId ? queryBuilder.eq('tenant_id', tenantId) : queryBuilder;
      const limitedQuery = typeof limit === 'number' ? scopedQuery.limit(limit) : scopedQuery;
      const { data, error } = await limitedQuery;

      if (error) throw error;
      return (data ?? []) as UserNotification[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const effectQueryKey = getQueryKey(userId, tenantId, limit);
    const effectBaseQueryKey = getBaseQueryKey(userId);

    const updateCache = (
      updater: (current: UserNotification[]) => UserNotification[]
    ) => {
      queryClient.setQueryData<UserNotification[]>(effectQueryKey, (current = []) => updater(current));
    };

    const channel = supabase
      .channel(`user-notifications:${userId}:${tenantId ?? 'all'}:${limit ?? 'all'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as UserNotification;
          if (tenantId && notification.tenant_id !== tenantId) return;
          updateCache((current) => upsertNotification(current, notification, limit));
          void queryClient.invalidateQueries({ queryKey: effectBaseQueryKey });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as UserNotification;
          if (tenantId && notification.tenant_id !== tenantId) return;
          updateCache((current) => upsertNotification(current, notification, limit));
          void queryClient.invalidateQueries({ queryKey: effectBaseQueryKey });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string } | null)?.id;
          if (!deletedId) {
            void queryClient.invalidateQueries({ queryKey: effectBaseQueryKey });
            return;
          }

          updateCache((current) => current.filter((item) => item.id !== deletedId));
          void queryClient.invalidateQueries({ queryKey: effectBaseQueryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit, queryClient, tenantId, userId]);

  const deleteNotifications = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const callbackQueryKey = getQueryKey(userId, tenantId, limit);
    const callbackBaseQueryKey = getBaseQueryKey(userId);

    const { error } = await supabase
      .from('notifications')
      .delete()
      .in('id', ids);

    if (error) throw error;

    queryClient.setQueryData<UserNotification[]>(callbackQueryKey, (current = []) =>
      current.filter((item) => !ids.includes(item.id))
    );
    await queryClient.invalidateQueries({ queryKey: callbackBaseQueryKey });
  }, [limit, queryClient, tenantId, userId]);

  const markAsRead = useCallback(
    async (id: string) => {
      const callbackQueryKey = getQueryKey(userId, tenantId, limit);
      const callbackBaseQueryKey = getBaseQueryKey(userId);
      const current = queryClient.getQueryData<UserNotification[]>(callbackQueryKey) ?? [];
      const target = current.find((item) => item.id === id);

      if (target && shouldAutoDismissResolvedNotification(target)) {
        await deleteNotifications([id]);
        return;
      }

      const readAt = new Date().toISOString();
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: readAt })
        .eq('id', id);

      if (error) throw error;

      queryClient.setQueryData<UserNotification[]>(callbackQueryKey, (current = []) =>
        current.map((item) => (item.id === id ? { ...item, read_at: readAt } : item))
      );
      await queryClient.invalidateQueries({ queryKey: callbackBaseQueryKey });
    },
    [deleteNotifications, limit, queryClient, tenantId, userId]
  );

  const markAllAsRead = useCallback(async () => {
    const callbackQueryKey = getQueryKey(userId, tenantId, limit);
    const callbackBaseQueryKey = getBaseQueryKey(userId);
    const current = queryClient.getQueryData<UserNotification[]>(callbackQueryKey) ?? [];
    const unreadItems = current.filter((item) => !item.read_at);
    const dismissIds = unreadItems
      .filter((item) => shouldAutoDismissResolvedNotification(item))
      .map((item) => item.id);
    const unreadIds = unreadItems
      .filter((item) => !shouldAutoDismissResolvedNotification(item))
      .map((item) => item.id);

    if (dismissIds.length > 0) {
      await deleteNotifications(dismissIds);
    }

    if (unreadIds.length === 0) return;

    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .in('id', unreadIds);

    if (error) throw error;

    queryClient.setQueryData<UserNotification[]>(callbackQueryKey, (items = []) =>
      items.map((item) => ({ ...item, read_at: item.read_at || readAt }))
    );
    await queryClient.invalidateQueries({ queryKey: callbackBaseQueryKey });
  }, [deleteNotifications, limit, queryClient, tenantId, userId]);

  return {
    ...query,
    notifications: query.data ?? [],
    unreadCount: (query.data ?? []).filter((item) => !item.read_at).length,
    markAsRead,
    markAllAsRead,
    deleteNotifications,
  };
}
