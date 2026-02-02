/**
 * Web Push Notifications Service
 * Handles browser push notifications using the Web Push API
 */

// Check if browser supports notifications
export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

// Get current permission status
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    console.log('[WebPush] Notifications not supported in this browser');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[WebPush] Permission result:', permission);
    return permission === 'granted';
  } catch (error) {
    console.error('[WebPush] Error requesting permission:', error);
    return false;
  }
}

// Check if permission is granted
export function hasNotificationPermission(): boolean {
  return getNotificationPermission() === 'granted';
}

// Show a local notification
export function showLocalNotification(
  title: string,
  options?: NotificationOptions
): Notification | null {
  if (!hasNotificationPermission()) {
    console.log('[WebPush] No permission to show notifications');
    return null;
  }

  try {
    const notification = new Notification(title, {
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      ...options,
    });

    return notification;
  } catch (error) {
    console.error('[WebPush] Error showing notification:', error);
    return null;
  }
}

// Schedule a notification using setTimeout (for browser - will only work while tab is open)
interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  scheduledFor: Date;
  data?: Record<string, unknown>;
  timeoutId?: ReturnType<typeof setTimeout>;
}

const scheduledNotifications: Map<string, ScheduledNotification> = new Map();

export function scheduleNotification(
  id: string,
  title: string,
  body: string,
  scheduledFor: Date,
  data?: Record<string, unknown>
): boolean {
  if (!hasNotificationPermission()) {
    return false;
  }

  const now = new Date();
  const delay = scheduledFor.getTime() - now.getTime();

  if (delay <= 0) {
    // Already past, skip
    return false;
  }

  // Cancel any existing scheduled notification with this ID
  cancelScheduledNotification(id);

  const timeoutId = setTimeout(() => {
    showLocalNotification(title, {
      body,
      data,
      tag: id,
      requireInteraction: true,
    });
    scheduledNotifications.delete(id);
  }, delay);

  scheduledNotifications.set(id, {
    id,
    title,
    body,
    scheduledFor,
    data,
    timeoutId,
  });

  console.log(`[WebPush] Scheduled notification "${id}" for ${scheduledFor.toISOString()}`);
  return true;
}

export function cancelScheduledNotification(id: string): void {
  const scheduled = scheduledNotifications.get(id);
  if (scheduled?.timeoutId) {
    clearTimeout(scheduled.timeoutId);
    scheduledNotifications.delete(id);
    console.log(`[WebPush] Cancelled scheduled notification "${id}"`);
  }
}

export function cancelAllScheduledNotifications(): void {
  for (const [id, scheduled] of scheduledNotifications) {
    if (scheduled.timeoutId) {
      clearTimeout(scheduled.timeoutId);
    }
  }
  scheduledNotifications.clear();
  console.log('[WebPush] Cancelled all scheduled notifications');
}

// Schedule shift reminders
interface ShiftForReminders {
  id: string;
  title: string;
  shift_date: string;
  start_time: string;
}

interface ReminderPreferences {
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  shift_start_enabled: boolean;
}

export function scheduleShiftReminders(
  shifts: ShiftForReminders[],
  prefs: ReminderPreferences
): number {
  if (!hasNotificationPermission()) {
    return 0;
  }

  // Cancel existing reminders
  cancelAllScheduledNotifications();

  const now = new Date();
  let scheduledCount = 0;

  for (const shift of shifts) {
    const shiftDateTime = new Date(`${shift.shift_date}T${shift.start_time}`);

    // 24h reminder
    if (prefs.reminder_24h_enabled) {
      const reminder24h = new Date(shiftDateTime.getTime() - 24 * 60 * 60 * 1000);
      if (reminder24h > now) {
        const scheduled = scheduleNotification(
          `reminder-24h-${shift.id}`,
          '📅 Plantão amanhã',
          `Seu plantão "${shift.title}" começa em 24 horas.`,
          reminder24h,
          { type: 'reminder_24h', shift_id: shift.id }
        );
        if (scheduled) scheduledCount++;
      }
    }

    // 2h reminder
    if (prefs.reminder_2h_enabled) {
      const reminder2h = new Date(shiftDateTime.getTime() - 2 * 60 * 60 * 1000);
      if (reminder2h > now) {
        const scheduled = scheduleNotification(
          `reminder-2h-${shift.id}`,
          '⏰ Plantão em 2 horas',
          `Seu plantão "${shift.title}" começa em 2 horas!`,
          reminder2h,
          { type: 'reminder_2h', shift_id: shift.id }
        );
        if (scheduled) scheduledCount++;
      }
    }

    // Shift start
    if (prefs.shift_start_enabled && shiftDateTime > now) {
      const scheduled = scheduleNotification(
        `shift-start-${shift.id}`,
        '🏥 Plantão iniciando',
        `Seu plantão "${shift.title}" está começando. Não esqueça do check-in!`,
        shiftDateTime,
        { type: 'shift_start', shift_id: shift.id }
      );
      if (scheduled) scheduledCount++;
    }
  }

  console.log(`[WebPush] Scheduled ${scheduledCount} shift reminders`);
  return scheduledCount;
}
