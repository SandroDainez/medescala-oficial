/**
 * Native Calendar Integration Service
 * Handles creating, updating, and deleting events in the device's native calendar
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

// Types for calendar operations
interface CalendarEventInput {
  title: string;
  location?: string;
  notes?: string;
  startDate: number; // Unix timestamp in ms
  endDate: number;   // Unix timestamp in ms
}

interface CalendarSyncEvent {
  id: string;
  user_id: string;
  tenant_id: string;
  shift_id: string;
  assignment_id: string | null;
  native_event_id: string;
  platform: string;
  shift_hash: string | null;
}

interface ShiftData {
  id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_name?: string;
}

/**
 * Check if running on a native platform (iOS/Android)
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
 * Generate a hash of shift data to detect changes
 */
function generateShiftHash(shift: ShiftData): string {
  const data = `${shift.title}|${shift.hospital}|${shift.location || ''}|${shift.shift_date}|${shift.start_time}|${shift.end_time}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Get the calendar plugin instance
 */
async function getCalendarPlugin() {
  const calendarModule = await import('@ebarooni/capacitor-calendar');
  return calendarModule.CapacitorCalendar;
}

/**
 * Request calendar permissions
 */
export async function requestCalendarPermissions(): Promise<boolean> {
  if (!isNativePlatform()) {
    console.log('[NativeCalendar] Not a native platform, skipping permission request');
    return false;
  }

  try {
    const Calendar = await getCalendarPlugin();
    
    // Request all permissions
    const result = await Calendar.requestAllPermissions();
    
    // Check if we have calendar access (the result structure varies by platform)
    return result && typeof result === 'object';
  } catch (error) {
    console.error('[NativeCalendar] Error requesting permissions:', error);
    return false;
  }
}

/**
 * Convert shift data to calendar event format
 */
function shiftToCalendarEvent(shift: ShiftData): CalendarEventInput {
  const startDateTime = new Date(`${shift.shift_date}T${shift.start_time}`);
  const endDateTime = new Date(`${shift.shift_date}T${shift.end_time}`);
  
  if (endDateTime <= startDateTime) {
    endDateTime.setDate(endDateTime.getDate() + 1);
  }

  return {
    title: `🏥 ${shift.title}`,
    location: [shift.hospital, shift.location].filter(Boolean).join(' - '),
    notes: [
      shift.sector_name ? `Setor: ${shift.sector_name}` : '',
      shift.hospital ? `Hospital: ${shift.hospital}` : '',
      shift.location || '',
      '',
      'Gerenciado pelo MedEscala'
    ].filter(Boolean).join('\n'),
    startDate: startDateTime.getTime(),
    endDate: endDateTime.getTime(),
  };
}

/**
 * Create a calendar event for a shift
 */
export async function createCalendarEvent(
  shift: ShiftData,
  userId: string,
  tenantId: string,
  assignmentId?: string
): Promise<string | null> {
  if (!isNativePlatform()) {
    console.log('[NativeCalendar] Not a native platform');
    return null;
  }

  const hasPermission = await requestCalendarPermissions();
  if (!hasPermission) {
    console.log('[NativeCalendar] No calendar permission');
    return null;
  }

  try {
    const Calendar = await getCalendarPlugin();
    const event = shiftToCalendarEvent(shift);
    
    // Create the event
    const result = await Calendar.createEvent(event);
    
    if (!result || !result.id) {
      console.log('[NativeCalendar] Event creation returned no ID');
      return null;
    }

    const nativeEventId = result.id;
    const platform = getPlatform();
    const shiftHash = generateShiftHash(shift);

    // Save to database
    const { error } = await supabase
      .from('calendar_sync_events')
      .upsert({
        user_id: userId,
        tenant_id: tenantId,
        shift_id: shift.id,
        assignment_id: assignmentId || null,
        native_event_id: nativeEventId,
        platform,
        shift_hash: shiftHash,
        last_synced_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,shift_id,platform'
      });

    if (error) {
      console.error('[NativeCalendar] Error saving sync record:', error);
    }

    console.log('[NativeCalendar] Event created:', nativeEventId);
    return nativeEventId;
  } catch (error) {
    console.error('[NativeCalendar] Error creating event:', error);
    return null;
  }
}

/**
 * Update an existing calendar event
 */
export async function updateCalendarEvent(
  shift: ShiftData,
  userId: string,
  tenantId: string
): Promise<boolean> {
  if (!isNativePlatform()) return false;

  try {
    const platform = getPlatform();
    
    const { data: syncRecord, error } = await supabase
      .from('calendar_sync_events')
      .select('*')
      .eq('user_id', userId)
      .eq('shift_id', shift.id)
      .eq('platform', platform)
      .maybeSingle();

    if (error || !syncRecord) {
      await createCalendarEvent(shift, userId, tenantId);
      return true;
    }

    const newHash = generateShiftHash(shift);
    if (syncRecord.shift_hash === newHash) {
      console.log('[NativeCalendar] Shift data unchanged, skipping update');
      return true;
    }

    // Delete old event and create new one
    await deleteCalendarEvent(shift.id, userId);
    await createCalendarEvent(shift, userId, tenantId);
    
    return true;
  } catch (error) {
    console.error('[NativeCalendar] Error updating event:', error);
    return false;
  }
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  shiftId: string,
  userId: string
): Promise<boolean> {
  if (!isNativePlatform()) return false;

  try {
    const platform = getPlatform();
    
    const { data: syncRecord, error } = await supabase
      .from('calendar_sync_events')
      .select('*')
      .eq('user_id', userId)
      .eq('shift_id', shiftId)
      .eq('platform', platform)
      .maybeSingle();

    if (error || !syncRecord) {
      console.log('[NativeCalendar] No sync record found for deletion');
      return true;
    }

    try {
      const Calendar = await getCalendarPlugin();
      await Calendar.deleteEvent({ id: syncRecord.native_event_id });
      console.log('[NativeCalendar] Event deleted:', syncRecord.native_event_id);
    } catch (deleteError) {
      console.warn('[NativeCalendar] Error deleting native event (may already be gone):', deleteError);
    }

    await supabase
      .from('calendar_sync_events')
      .delete()
      .eq('id', syncRecord.id);

    return true;
  } catch (error) {
    console.error('[NativeCalendar] Error deleting event:', error);
    return false;
  }
}

/**
 * Sync all user's shifts to calendar
 */
export async function syncAllShiftsToCalendar(
  shifts: ShiftData[],
  userId: string,
  tenantId: string
): Promise<{ created: number; updated: number; deleted: number }> {
  if (!isNativePlatform()) {
    return { created: 0, updated: 0, deleted: 0 };
  }

  const hasPermission = await requestCalendarPermissions();
  if (!hasPermission) {
    return { created: 0, updated: 0, deleted: 0 };
  }

  const platform = getPlatform();
  const stats = { created: 0, updated: 0, deleted: 0 };

  try {
    const { data: existingRecords } = await supabase
      .from('calendar_sync_events')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform);

    const existingMap = new Map<string, CalendarSyncEvent>();
    (existingRecords || []).forEach((r) => {
      existingMap.set(r.shift_id, r as CalendarSyncEvent);
    });

    const currentShiftIds = new Set(shifts.map(s => s.id));

    for (const [shiftId] of existingMap) {
      if (!currentShiftIds.has(shiftId)) {
        await deleteCalendarEvent(shiftId, userId);
        stats.deleted++;
      }
    }

    for (const shift of shifts) {
      const existing = existingMap.get(shift.id);
      
      if (!existing) {
        await createCalendarEvent(shift, userId, tenantId);
        stats.created++;
      } else {
        const newHash = generateShiftHash(shift);
        if (existing.shift_hash !== newHash) {
          await updateCalendarEvent(shift, userId, tenantId);
          stats.updated++;
        }
      }
    }

    console.log('[NativeCalendar] Sync complete:', stats);
    return stats;
  } catch (error) {
    console.error('[NativeCalendar] Error syncing shifts:', error);
    return stats;
  }
}

/**
 * Get user's calendar sync preferences
 */
export async function getCalendarSyncEnabled(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('user_notification_preferences')
      .select('calendar_sync_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    return data?.calendar_sync_enabled ?? false;
  } catch {
    return false;
  }
}

/**
 * Set user's calendar sync preference
 */
export async function setCalendarSyncEnabled(
  userId: string,
  tenantId: string,
  enabled: boolean
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: userId,
        tenant_id: tenantId,
        calendar_sync_enabled: enabled,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    return !error;
  } catch {
    return false;
  }
}
