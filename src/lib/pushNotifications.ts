/**
 * Push Notifications Service
 * Handles OneSignal integration for push notifications
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

interface NotificationPreferences {
  push_enabled: boolean;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  shift_start_enabled: boolean;
  swap_notifications_enabled: boolean;
  calendar_sync_enabled: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  reminder_24h_enabled: true,
  reminder_2h_enabled: true,
  shift_start_enabled: true,
  swap_notifications_enabled: true,
  calendar_sync_enabled: false,
};

/**
 * Check if running on a native platform
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get current platform
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'web';
}

/**
 * Initialize push notifications
 * This should be called when the app starts
 */
export async function initializePushNotifications(
  userId: string,
  tenantId: string
): Promise<boolean> {
  if (!isNativePlatform()) {
    console.log('[PushNotifications] Not a native platform, skipping initialization');
    return false;
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    
    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    
    if (permResult.receive !== 'granted') {
      console.log('[PushNotifications] Permission not granted');
      return false;
    }

    // Register for push notifications
    await PushNotifications.register();

    // Listen for registration token
    PushNotifications.addListener('registration', async (token) => {
      console.log('[PushNotifications] Registration token:', token.value);
      await saveDeviceToken(userId, tenantId, token.value);
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[PushNotifications] Registration error:', error);
    });

    // Listen for push notifications received
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[PushNotifications] Notification received:', notification);
      // Handle foreground notification - could show a toast or badge
    });

    // Listen for notification actions
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[PushNotifications] Action performed:', action);
      // Handle notification tap - could navigate to specific screen
      handleNotificationAction(action.notification.data);
    });

    console.log('[PushNotifications] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[PushNotifications] Initialization error:', error);
    return false;
  }
}

/**
 * Save device token to database
 */
async function saveDeviceToken(
  userId: string,
  tenantId: string,
  deviceToken: string
): Promise<void> {
  const platform = getPlatform();
  
  try {
    const { error } = await supabase
      .from('push_device_tokens')
      .upsert({
        user_id: userId,
        tenant_id: tenantId,
        device_token: deviceToken,
        platform,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,device_token'
      });

    if (error) {
      console.error('[PushNotifications] Error saving device token:', error);
    } else {
      console.log('[PushNotifications] Device token saved');
    }
  } catch (error) {
    console.error('[PushNotifications] Error saving device token:', error);
  }
}

/**
 * Deactivate device token (on logout)
 */
export async function deactivateDeviceToken(userId: string): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    
    // Get current token
    // Note: Capacitor doesn't have a direct way to get the current token
    // The token is only available during registration
    // We'll mark all tokens for this user/device as inactive
    
    const platform = getPlatform();
    
    await supabase
      .from('push_device_tokens')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('platform', platform);

    // Unregister from push notifications
    await PushNotifications.unregister();
    
    console.log('[PushNotifications] Device token deactivated');
  } catch (error) {
    console.error('[PushNotifications] Error deactivating token:', error);
  }
}

/**
 * Handle notification action (when user taps notification)
 */
function handleNotificationAction(data: Record<string, unknown> | undefined): void {
  if (!data) return;

  // Navigate based on notification type
  const notificationType = data.type as string;
  const shiftId = data.shift_id as string;

  switch (notificationType) {
    case 'reminder_24h':
    case 'reminder_2h':
    case 'shift_start':
      // Navigate to shift details or calendar
      if (shiftId) {
        window.location.href = '/app/agenda';
      }
      break;
    case 'swap_request':
    case 'swap_accepted':
    case 'swap_rejected':
      // Navigate to swaps page
      window.location.href = '/user/swaps';
      break;
    default:
      // Navigate to notifications
      window.location.href = '/user/notifications';
  }
}

/**
 * Get user's notification preferences
 */
export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  try {
    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_PREFERENCES;
    }

    return {
      push_enabled: data.push_enabled ?? DEFAULT_PREFERENCES.push_enabled,
      reminder_24h_enabled: data.reminder_24h_enabled ?? DEFAULT_PREFERENCES.reminder_24h_enabled,
      reminder_2h_enabled: data.reminder_2h_enabled ?? DEFAULT_PREFERENCES.reminder_2h_enabled,
      shift_start_enabled: data.shift_start_enabled ?? DEFAULT_PREFERENCES.shift_start_enabled,
      swap_notifications_enabled: data.swap_notifications_enabled ?? DEFAULT_PREFERENCES.swap_notifications_enabled,
      calendar_sync_enabled: data.calendar_sync_enabled ?? DEFAULT_PREFERENCES.calendar_sync_enabled,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save user's notification preferences
 */
export async function saveNotificationPreferences(
  userId: string,
  tenantId: string,
  preferences: Partial<NotificationPreferences>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: userId,
        tenant_id: tenantId,
        ...preferences,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    return !error;
  } catch {
    return false;
  }
}

/**
 * Schedule local notifications for upcoming shifts
 * This is a fallback for when push notifications can't be delivered
 */
export async function scheduleLocalNotifications(
  shifts: Array<{
    id: string;
    title: string;
    shift_date: string;
    start_time: string;
  }>,
  preferences: NotificationPreferences
): Promise<void> {
  if (!isNativePlatform() || !preferences.push_enabled) return;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    
    // Request permission
    const permResult = await LocalNotifications.requestPermissions();
    if (permResult.display !== 'granted') {
      console.log('[LocalNotifications] Permission not granted');
      return;
    }

    // Cancel existing scheduled notifications
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }

    const notifications: Array<{
      id: number;
      title: string;
      body: string;
      schedule: { at: Date };
      extra: Record<string, unknown>;
    }> = [];

    const now = new Date();
    let notificationId = 1;

    for (const shift of shifts) {
      const shiftDateTime = new Date(`${shift.shift_date}T${shift.start_time}`);
      
      // 24h reminder
      if (preferences.reminder_24h_enabled) {
        const reminder24h = new Date(shiftDateTime.getTime() - 24 * 60 * 60 * 1000);
        if (reminder24h > now) {
          notifications.push({
            id: notificationId++,
            title: '📅 Plantão amanhã',
            body: `Seu plantão "${shift.title}" começa em 24 horas.`,
            schedule: { at: reminder24h },
            extra: { type: 'reminder_24h', shift_id: shift.id },
          });
        }
      }

      // 2h reminder
      if (preferences.reminder_2h_enabled) {
        const reminder2h = new Date(shiftDateTime.getTime() - 2 * 60 * 60 * 1000);
        if (reminder2h > now) {
          notifications.push({
            id: notificationId++,
            title: '⏰ Plantão em 2 horas',
            body: `Seu plantão "${shift.title}" começa em 2 horas!`,
            schedule: { at: reminder2h },
            extra: { type: 'reminder_2h', shift_id: shift.id },
          });
        }
      }

      // Shift start
      if (preferences.shift_start_enabled && shiftDateTime > now) {
        notifications.push({
          id: notificationId++,
          title: '🏥 Plantão iniciando',
          body: `Seu plantão "${shift.title}" está começando. Não esqueça do check-in!`,
          schedule: { at: shiftDateTime },
          extra: { type: 'shift_start', shift_id: shift.id },
        });
      }
    }

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
      console.log(`[LocalNotifications] Scheduled ${notifications.length} notifications`);
    }
  } catch (error) {
    console.error('[LocalNotifications] Error scheduling notifications:', error);
  }
}
