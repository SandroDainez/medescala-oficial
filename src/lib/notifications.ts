// Web Push Notifications Helper

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
}

export function isNotificationsSupported(): boolean {
  return 'Notification' in window;
}

export function isPushSupported(): boolean {
  return 'PushManager' in window && 'serviceWorker' in navigator;
}

export async function showLocalNotification(
  title: string,
  options?: NotificationOptions
): Promise<Notification | null> {
  if (!isNotificationsSupported()) {
    console.log('Notifications not supported');
    return null;
  }

  const permission = await requestNotificationPermission();
  
  if (permission !== 'granted') {
    console.log('Notification permission denied');
    return null;
  }

  return new Notification(title, {
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    ...options,
  });
}

// Schedule a reminder notification
export async function scheduleShiftReminder(
  shiftId: string,
  shiftTitle: string,
  shiftDate: Date,
  hoursBeforeShift: number = 2
): Promise<boolean> {
  const now = new Date();
  const reminderTime = new Date(shiftDate.getTime() - hoursBeforeShift * 60 * 60 * 1000);
  
  if (reminderTime <= now) {
    console.log('Reminder time has already passed');
    return false;
  }

  const delay = reminderTime.getTime() - now.getTime();
  
  // Store the reminder in localStorage for persistence
  const reminders = getStoredReminders();
  reminders[shiftId] = {
    shiftTitle,
    shiftDate: shiftDate.toISOString(),
    reminderTime: reminderTime.toISOString(),
    hoursBeforeShift,
  };
  localStorage.setItem('medescala-reminders', JSON.stringify(reminders));

  // Set up the notification (will only work if the page is open)
  setTimeout(() => {
    showLocalNotification(
      '⏰ Lembrete de Plantão',
      {
        body: `Seu plantão "${shiftTitle}" começa em ${hoursBeforeShift} hora(s)!`,
        tag: `shift-reminder-${shiftId}`,
        requireInteraction: true,
      }
    );
  }, delay);

  return true;
}

export function getStoredReminders(): Record<string, {
  shiftTitle: string;
  shiftDate: string;
  reminderTime: string;
  hoursBeforeShift: number;
}> {
  try {
    const stored = localStorage.getItem('medescala-reminders');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function clearReminder(shiftId: string): void {
  const reminders = getStoredReminders();
  delete reminders[shiftId];
  localStorage.setItem('medescala-reminders', JSON.stringify(reminders));
}

// Check and trigger any pending reminders on page load
export function checkPendingReminders(): void {
  const reminders = getStoredReminders();
  const now = new Date();

  Object.entries(reminders).forEach(([shiftId, reminder]) => {
    const reminderTime = new Date(reminder.reminderTime);
    const shiftDate = new Date(reminder.shiftDate);

    // If reminder time has passed but shift hasn't started yet
    if (reminderTime <= now && shiftDate > now) {
      showLocalNotification(
        '⏰ Lembrete de Plantão',
        {
          body: `Seu plantão "${reminder.shiftTitle}" está próximo!`,
          tag: `shift-reminder-${shiftId}`,
          requireInteraction: true,
        }
      );
      clearReminder(shiftId);
    }
    // If shift has passed, clean up the reminder
    else if (shiftDate <= now) {
      clearReminder(shiftId);
    }
  });
}

// Get notification settings from localStorage
export function getNotificationSettings(): {
  enabled: boolean;
  reminderHours: number;
} {
  try {
    const stored = localStorage.getItem('medescala-notification-settings');
    return stored ? JSON.parse(stored) : { enabled: true, reminderHours: 2 };
  } catch {
    return { enabled: true, reminderHours: 2 };
  }
}

export function saveNotificationSettings(settings: {
  enabled: boolean;
  reminderHours: number;
}): void {
  localStorage.setItem('medescala-notification-settings', JSON.stringify(settings));
}
