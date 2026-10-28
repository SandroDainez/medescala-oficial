import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { generateICSFile, shareICSFile, downloadICSFile, type EntregaDoCalendario } from '@/lib/calendarExport';

interface ShiftForCalendar {
  id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_name?: string;
}

interface UseWebCalendarSyncReturn {
  shifts: ShiftForCalendar[];
  loading: boolean;
  hasShifts: boolean;
  exportToCalendar: () => Promise<EntregaDoCalendario>;
  downloadCalendar: () => boolean;
  lastExportedAt: Date | null;
  shiftsChanged: boolean;
  markAsExported: () => void;
}

const STORAGE_KEY = 'medescala-calendar-export';

function getStoredExportInfo(): { hash: string; exportedAt: string } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function setStoredExportInfo(hash: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    hash,
    exportedAt: new Date().toISOString(),
  }));
}

function generateShiftsHash(shifts: ShiftForCalendar[]): string {
  const data = shifts
    .map(s => `${s.id}|${s.title}|${s.shift_date}|${s.start_time}|${s.end_time}`)
    .sort()
    .join('::');
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

export function useWebCalendarSync(): UseWebCalendarSyncReturn {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [shifts, setShifts] = useState<ShiftForCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastExportedAt, setLastExportedAt] = useState<Date | null>(null);
  const [shiftsChanged, setShiftsChanged] = useState(false);
  const [currentHash, setCurrentHash] = useState<string>('');

  const fetchShifts = useCallback(async () => {
    if (!user?.id || !currentTenantId) {
      setLoading(false);
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('shift_assignments')
        .select(`
          id,
          shifts!inner (
            id,
            title,
            hospital,
            shift_date,
            start_time,
            end_time,
            location,
            sectors (
              name
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('tenant_id', currentTenantId)
        .gte('shifts.shift_date', today);

      if (error) throw error;

      const formattedShifts: ShiftForCalendar[] = (data || [])
        .map((a: any) => ({
          id: a.shifts.id,
          title: a.shifts.title,
          hospital: a.shifts.hospital,
          location: a.shifts.location,
          shift_date: a.shifts.shift_date,
          start_time: a.shifts.start_time,
          end_time: a.shifts.end_time,
          sector_name: a.shifts.sectors?.name,
        }))
        .sort((a, b) => a.shift_date.localeCompare(b.shift_date));

      setShifts(formattedShifts);

      // Check if shifts changed since last export
      const newHash = generateShiftsHash(formattedShifts);
      setCurrentHash(newHash);

      const storedInfo = getStoredExportInfo();
      if (storedInfo) {
        setLastExportedAt(new Date(storedInfo.exportedAt));
        setShiftsChanged(storedInfo.hash !== newHash);
      } else {
        setShiftsChanged(formattedShifts.length > 0);
      }
    } catch (error) {
      console.error('Error fetching shifts for calendar:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, currentTenantId]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Subscribe to shift_assignments changes for real-time updates
  useEffect(() => {
    if (!user?.id || !currentTenantId) return;

    const channel = supabase
      .channel('calendar-sync-shifts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shift_assignments',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchShifts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, currentTenantId, fetchShifts]);

  const exportToCalendar = useCallback(async (): Promise<EntregaDoCalendario> => {
    if (shifts.length === 0) return 'falhou';

    const icsContent = generateICSFile(shifts, 'Meus Plantões - MedEscala');
    const entrega = await shareICSFile(icsContent, 'meus-plantoes.ics');

    // Só conta como exportado o que chegou ao médico: marcar depois de uma
    // entrega falha esconderia dele que a escala nova nunca foi para fora.
    if (entrega !== 'falhou') {
      setStoredExportInfo(currentHash);
      setLastExportedAt(new Date());
      setShiftsChanged(false);
    }

    return entrega;
  }, [shifts, currentHash]);

  const downloadCalendar = useCallback((): boolean => {
    if (shifts.length === 0) return false;

    const icsContent = generateICSFile(shifts, 'Meus Plantões - MedEscala');
    if (!downloadICSFile(icsContent, 'meus-plantoes.ics')) return false;

    setStoredExportInfo(currentHash);
    setLastExportedAt(new Date());
    setShiftsChanged(false);
    return true;
  }, [shifts, currentHash]);

  const markAsExported = useCallback(() => {
    setStoredExportInfo(currentHash);
    setLastExportedAt(new Date());
    setShiftsChanged(false);
  }, [currentHash]);

  return {
    shifts,
    loading,
    hasShifts: shifts.length > 0,
    exportToCalendar,
    downloadCalendar,
    lastExportedAt,
    shiftsChanged,
    markAsExported,
  };
}
