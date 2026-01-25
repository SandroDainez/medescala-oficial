import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Plus, UserPlus, Trash2, Edit, Users, Clock, MapPin, Calendar, LayoutGrid, Moon, Sun, Printer, Repeat, Check, X, AlertTriangle, CheckSquare, Square, Copy, History, FileText } from 'lucide-react';
import ScheduleMovements, { recordScheduleMovement } from './ScheduleMovements';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, getDate, getDaysInMonth, setDate } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Sector {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
  default_day_value?: number | null;
  default_night_value?: number | null;
}

interface Shift {
  id: string;
  title: string;
  hospital: string;
  location: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  base_value: number | null;
  notes: string | null;
  sector_id: string | null;
}

interface ShiftAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_value: number | null;
  status: string;
  profile: { name: string | null } | null;
}

interface ShiftOffer {
  id: string;
  shift_id: string;
  user_id: string;
  status: string;
  message: string | null;
  profile: { name: string | null } | null;
}

interface Member {
  user_id: string;
  profile: { id: string; name: string | null } | null;
}

interface SectorMembership {
  id: string;
  sector_id: string;
  user_id: string;
}

type ViewMode = 'month' | 'week';
type ShiftAssignmentType = 'vago' | 'disponivel' | string; // string is user_id

interface ShiftCalendarProps {
  initialSectorId?: string;
}

export default function ShiftCalendar({ initialSectorId }: ShiftCalendarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [shiftOffers, setShiftOffers] = useState<ShiftOffer[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sectorMemberships, setSectorMemberships] = useState<SectorMembership[]>([]);
  const [userSectorValues, setUserSectorValues] = useState<Map<string, { day_value: number | null; night_value: number | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [filterSector, setFilterSector] = useState<string>(initialSectorId || searchParams.get('sector') || 'all');

  // When viewing a specific sector card while filter is "all",
  // keep the day dialog scoped to that sector.
  const [dayDialogSectorId, setDayDialogSectorId] = useState<string | null>(null);
  
  // Bulk selection mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(new Set());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  
  // Dialogs
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  // Prevent immediate re-open after a programmatic close (e.g. focus/trigger quirks)
  const shiftDialogCloseGuardRef = useRef(false);
  const bulkEditDialogCloseGuardRef = useRef(false);

  // Extra hard guard: temporarily disable the trigger button to avoid click-through (mouse up)
  // after closing/saving the bulk edit dialog.
  const [bulkEditTriggerDisabled, setBulkEditTriggerDisabled] = useState(false);

  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [acknowledgedConflicts, setAcknowledgedConflicts] = useState<Set<string>>(new Set());
  const [bulkCreateDialogOpen, setBulkCreateDialogOpen] = useState(false);
  const [copyScheduleDialogOpen, setCopyScheduleDialogOpen] = useState(false);
  const [copyTargetMonth, setCopyTargetMonth] = useState<Date | null>(null);
  const [copyInProgress, setCopyInProgress] = useState(false);
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);
  const [bulkEditShifts, setBulkEditShifts] = useState<Shift[]>([]);
  
  // Conflict resolution states
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);
  const [pendingAcknowledgeConflict, setPendingAcknowledgeConflict] = useState<ShiftConflict | null>(null);
  const [justificationText, setJustificationText] = useState('');
  const [conflictHistoryDialogOpen, setConflictHistoryDialogOpen] = useState(false);
  const [conflictHistory, setConflictHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [removeConfirmDialogOpen, setRemoveConfirmDialogOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ conflict: ShiftConflict; assignmentToRemove: ShiftConflict['shifts'][0]; assignmentToKeep: ShiftConflict['shifts'][0] } | null>(null);

  function safeParseConflictDetails(details: any): any[] {
    if (!details) return [];
    if (Array.isArray(details)) return details;
    if (typeof details === 'string') {
      try {
        const parsed = JSON.parse(details);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function getNonEmptyString(...values: any[]): string | null {
    for (const v of values) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  }

  function getResolutionLocation(
    resolution: any,
    kind: 'removed' | 'kept'
  ): { sectorName: string; shiftTime: string } {
    const sectorNameFromColumns = kind === 'removed' ? resolution?.removed_sector_name : resolution?.kept_sector_name;
    const shiftTimeFromColumns = kind === 'removed' ? resolution?.removed_shift_time : resolution?.kept_shift_time;

    // Prefer explicit columns (newer records)
    if ((sectorNameFromColumns && String(sectorNameFromColumns).trim()) || (shiftTimeFromColumns && String(shiftTimeFromColumns).trim())) {
      return {
        sectorName: sectorNameFromColumns || 'Não informado',
        shiftTime: shiftTimeFromColumns || '—',
      };
    }

    // Fallback for older records: derive from conflict_details using assignment IDs
    const details = safeParseConflictDetails(resolution?.conflict_details);
    const assignmentId = kind === 'removed' ? resolution?.removed_assignment_id : resolution?.kept_assignment_id;
    const match = assignmentId
      ? details.find((d: any) => {
          const a = d?.assignmentId ?? d?.assignment_id;
          return a && String(a) === String(assignmentId);
        })
      : null;

    if (match) {
      const sectorNameFromDetails = getNonEmptyString(
        match?.sectorName,
        match?.sector_name,
        match?.sector,
        match?.hospital,
        match?.location
      );

      // If older JSON doesn't include sectorName, try to derive from shiftId using currently loaded shifts.
      const shiftId = match?.shiftId ?? match?.shift_id;
      const shiftFromState = shiftId ? shifts.find(s => String(s.id) === String(shiftId)) : null;
      const sectorNameFromState = shiftFromState ? getSectorName(shiftFromState.sector_id, shiftFromState.hospital) : null;

      const sectorName = sectorNameFromDetails || sectorNameFromState || 'Não informado';

      const rawStart = getNonEmptyString(match?.startTime, match?.start_time);
      const rawEnd = getNonEmptyString(match?.endTime, match?.end_time);
      const start = rawStart ? rawStart.slice(0, 5) : null;
      const end = rawEnd ? rawEnd.slice(0, 5) : null;
      const shiftTime = start && end ? `${start} - ${end}` : '—';
      return { sectorName, shiftTime };
    }

    return { sectorName: 'Não informado', shiftTime: '—' };
  }

  // Bulk edit (apply same changes to selected shifts)
  const [bulkApplyDialogOpen, setBulkApplyDialogOpen] = useState(false);
  const [bulkApplyData, setBulkApplyData] = useState({
    title: '',
    start_time: '',
    end_time: '',
    base_value: '',
    assigned_user_id: '', // '' means keep
  });
  const [bulkApplyShiftIds, setBulkApplyShiftIds] = useState<string[]>([]);
  
  // Form data
  const [formData, setFormData] = useState({
    hospital: '',
    location: '',
    shift_date: '',
    start_time: '',
    end_time: '',
    base_value: '',
    notes: '',
    sector_id: '',
    assigned_user_id: '',
    duration_hours: '',
    repeat_weeks: 0,
    quantity: 1,
    use_sector_default: true, // If true, use sector default when value is empty
  });

  // Individual shift data when creating multiple shifts
  interface MultiShiftData {
    user_id: string;
    start_time: string;
    end_time: string;
  }
  const [multiShifts, setMultiShifts] = useState<MultiShiftData[]>([]);

  // Bulk edit data for editing all shifts of a day
  interface BulkEditShiftData {
    id: string;
    hospital: string;
    location: string;
    start_time: string;
    end_time: string;
    base_value: string;
    notes: string;
    sector_id: string;
    assigned_user_id: string;
  }
  const [bulkEditData, setBulkEditData] = useState<BulkEditShiftData[]>([]);

  const [assignData, setAssignData] = useState({
    user_id: '',
    assigned_value: '',
  });

  // Update filter when initialSectorId changes (from URL)
  useEffect(() => {
    if (initialSectorId !== undefined) {
      setFilterSector(initialSectorId || 'all');
    }
  }, [initialSectorId]);

  useEffect(() => {
    // IMPORTANT: wait for authenticated user before calling RPCs that depend on auth.uid().
    // If we fetch too early, the backend returns empty rows and names "disappear" until a manual refresh.
    if (currentTenantId && user?.id) {
      fetchData();
    }
  }, [currentTenantId, user?.id, currentDate, viewMode]);

  async function fetchData() {
    if (!currentTenantId || !user?.id) return;
    setLoading(true);

    let start: Date, end: Date;
    if (viewMode === 'month') {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    } else {
      start = startOfWeek(currentDate, { weekStartsOn: 0 });
      end = endOfWeek(currentDate, { weekStartsOn: 0 });
    }

    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    try {
      const [shiftsRes, membersRes, sectorsRes, sectorMembershipsRes] = await Promise.all([
        supabase
          .from('shifts')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .gte('shift_date', startStr)
          .lte('shift_date', endStr)
          .order('shift_date', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase
          .from('memberships')
          .select('user_id, profile:profiles!memberships_user_id_profiles_fkey(id, name)')
          .eq('tenant_id', currentTenantId)
          .eq('active', true),
        supabase
          .from('sectors')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .eq('active', true)
          .order('name'),
        supabase
          .from('sector_memberships')
          .select('id, sector_id, user_id')
          .eq('tenant_id', currentTenantId),
      ]);

      if (sectorsRes.error) throw sectorsRes.error;
      if (sectorMembershipsRes.error) throw sectorMembershipsRes.error;
      if (membersRes.error) throw membersRes.error;
      if (shiftsRes.error) throw shiftsRes.error;

      setSectors((sectorsRes.data ?? []) as Sector[]);
      setSectorMemberships(sectorMembershipsRes.data ?? []);
      setMembers((membersRes.data ?? []) as unknown as Member[]);

      // Fetch user sector values for individual pricing (scoped to current month/year)
      const currentMonth = currentDate.getMonth() + 1; // 1-12
      const currentYear = currentDate.getFullYear();
      const { data: userValuesData } = await supabase
        .from('user_sector_values')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .eq('month', currentMonth)
        .eq('year', currentYear);
      
      const valuesMap = new Map<string, { day_value: number | null; night_value: number | null }>();
      (userValuesData ?? []).forEach((uv: any) => {
        const key = `${uv.sector_id}:${uv.user_id}`;
        valuesMap.set(key, { day_value: uv.day_value, night_value: uv.night_value });
      });
      setUserSectorValues(valuesMap);

      const nextShifts = (shiftsRes.data ?? []) as Shift[];
      setShifts(nextShifts);

      // Fetch assignments/offers by date range (avoids huge URL `in.(...ids...)` -> 400)
      // If RPC fails transiently, DO NOT wipe existing names; keep last good state and notify.
      const [assignmentsRes, offersRes] = await Promise.all([
        supabase.rpc('get_shift_assignments_range', {
          _tenant_id: currentTenantId,
          _start: startStr,
          _end: endStr,
        }),
        supabase.rpc('get_shift_offers_pending_range', {
          _tenant_id: currentTenantId,
          _start: startStr,
          _end: endStr,
        }),
      ]);

      if (assignmentsRes.error) {
        console.error('[ShiftCalendar] get_shift_assignments_range error', assignmentsRes.error);
        toast({
          title: 'Erro ao carregar nomes',
          description: 'Não foi possível carregar os plantonistas agora. Tentaremos novamente automaticamente.',
          variant: 'destructive',
        });
        // Retry once after a short delay
        setTimeout(() => {
          if (currentTenantId && user?.id) fetchData();
        }, 1200);
      } else {
        const mapped = ((assignmentsRes.data ?? []) as any[]).map((row) => ({
          id: row.id,
          shift_id: row.shift_id,
          user_id: row.user_id,
          assigned_value: row.assigned_value,
          status: row.status,
          profile: { name: row.name ?? null },
        }));
        setAssignments(mapped as unknown as ShiftAssignment[]);
      }

      if (offersRes.error) {
        console.error('[ShiftCalendar] get_shift_offers_pending_range error', offersRes.error);
        // Offers are secondary; keep previous state silently.
      } else {
        const mapped = ((offersRes.data ?? []) as any[]).map((row) => ({
          id: row.id,
          shift_id: row.shift_id,
          user_id: row.user_id,
          status: row.status,
          message: row.message,
          profile: { name: row.name ?? null },
        }));
        setShiftOffers(mapped as unknown as ShiftOffer[]);
      }
    } catch (error: any) {
      console.error('[ShiftCalendar] fetchData error', error);
      toast({
        title: 'Erro ao carregar calendário',
        description: error?.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Get members that belong to a specific sector
  function getMembersForSector(sectorId: string): Member[] {
    const sectorUserIds = sectorMemberships
      .filter(sm => sm.sector_id === sectorId)
      .map(sm => sm.user_id);
    return members.filter(m => sectorUserIds.includes(m.user_id));
  }

  // Check if shift is nocturnal (7h-19h = diurno, 19h-7h = noturno)
  function isNightShift(startTime: string, endTime: string): boolean {
    const startHour = parseInt(startTime.split(':')[0], 10);
    // 19h-7h = noturno (horário de início >= 19 ou < 7)
    return startHour >= 19 || startHour < 7;
  }

  // Get sector default value based on shift time
  function getSectorDefaultValue(sectorId: string | null, startTime: string): number | null {
    if (!sectorId) return null;
    const sector = sectors.find(s => s.id === sectorId);
    if (!sector) return null;
    
    const isNight = isNightShift(startTime, '');
    return isNight ? (sector.default_night_value ?? null) : (sector.default_day_value ?? null);
  }

  // Get individual plantonista value for a sector (if set)
  function getUserSectorValue(sectorId: string | null, userId: string | null, startTime: string): number | null {
    if (!sectorId || !userId) return null;
    const key = `${sectorId}:${userId}`;
    const userValue = userSectorValues.get(key);
    if (!userValue) return null;
    
    const isNight = isNightShift(startTime, '');
    return isNight ? (userValue.night_value ?? null) : (userValue.day_value ?? null);
  }

  // Calculate duration in hours between start and end time
  function calculateDurationHours(startTime: string, endTime: string): number {
    if (!startTime || !endTime) return 12; // Default to 12h
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    let hours = endH - startH;
    let minutes = endM - startM;
    if (hours < 0 || (hours === 0 && minutes < 0)) {
      hours += 24;
    }
    return hours + minutes / 60;
  }

  // Calculate pro-rata value based on shift duration
  // Standard shift is 12 hours, so a 6-hour shift pays half
  function calculateProRataValue(baseValue: number | null, durationHours: number): number | null {
    if (baseValue === null || baseValue === 0) return baseValue;
    const STANDARD_HOURS = 12;
    if (durationHours === STANDARD_HOURS) return baseValue;
    return Number(((baseValue / STANDARD_HOURS) * durationHours).toFixed(2));
  }

  // Get display value for a shift (calculates pro-rata based on duration)
  // This is used to show calculated values in the calendar view
  function getShiftDisplayValue(shift: { start_time: string; end_time: string; base_value: number | null; sector_id: string | null }): number | null {
    const duration = calculateDurationHours(shift.start_time, shift.end_time);
    
    // If shift has explicit base_value (including zero), use it
    // Zero is intentional "no payment" and should not fall back to sector default
    if (shift.base_value !== null) {
      if (shift.base_value === 0) return 0; // Intentional zero
      return calculateProRataValue(shift.base_value, duration);
    }
    
    // Otherwise calculate from sector default
    const sectorValue = getSectorDefaultValue(shift.sector_id, shift.start_time);
    return calculateProRataValue(sectorValue, duration);
  }

  // Get display value for an assignment (considers individual user values and pro-rata)
  // Priority order (highest to lowest):
  // 1. Individual user override (user_sector_values) — ALWAYS wins if set (including zero)
  // 2. Manual assignment value (assigned_value different from auto-calculated defaults)
  // 3. Shift base_value
  // 4. Sector default value
  function getAssignmentDisplayValue(
    assignment: { assigned_value: number | null; user_id: string },
    shift: { start_time: string; end_time: string; base_value: number | null; sector_id: string | null }
  ): number | null {
    const duration = calculateDurationHours(shift.start_time, shift.end_time);

    // 1) PRIORITY: Individual plantonista value ALWAYS wins (including zero)
    // This is the whole point of individual overrides — they should never be bypassed
    const userValue = getUserSectorValue(shift.sector_id, assignment.user_id, shift.start_time);
    if (userValue !== null) {
      // Zero is intentional "no payment" for this user
      if (userValue === 0) return 0;
      return calculateProRataValue(userValue, duration);
    }

    // 2) If assignment has an explicit value (including zero), use it
    if (assignment.assigned_value !== null) {
      if (assignment.assigned_value === 0) return 0; // Intentional zero
      return assignment.assigned_value; // Already calculated at save time
    }
    
    // 3) Fall back to shift base value (including zero)
    if (shift.base_value !== null) {
      if (shift.base_value === 0) return 0; // Intentional zero
      return calculateProRataValue(shift.base_value, duration);
    }
    
    // 4) Fall back to sector default
    const sectorValue = getSectorDefaultValue(shift.sector_id, shift.start_time);
    return calculateProRataValue(sectorValue, duration);
  }

  // Generate automatic title based on time
  function generateShiftTitle(startTime: string, endTime: string): string {
    const isNight = isNightShift(startTime, endTime);
    return isNight ? 'Plantão Noturno' : 'Plantão Diurno';
  }

  // Get sector color
  function getSectorColor(sectorId: string | null, hospital: string): string {
    if (sectorId) {
      const sector = sectors.find(s => s.id === sectorId);
      if (sector?.color) return sector.color;
    }
    // Fallback colors based on hospital name
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
    const index = hospital.charCodeAt(0) % colors.length;
    return colors[index];
  }

  // Get sector name
  function getSectorName(sectorId: string | null, hospital: string): string {
    if (sectorId) {
      const sector = sectors.find(s => s.id === sectorId);
      if (sector) return sector.name;
    }
    return hospital?.trim() ? hospital : 'Não informado';
  }

  // Helper to parse monetary values with precision (avoids floating point errors)
  // Accepts "800", "800.00", "800,00", "1.234,56".
  function parseMoneyValue(value: string | number): number {
    if (typeof value === 'number') return Number(value.toFixed(2));

    const raw = (value ?? '').toString().trim();
    if (!raw) return 0;

    // Normalize pt-BR formats: remove thousands separators and convert comma to dot.
    // If it contains a comma, assume comma is decimal separator.
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw;

    // Keep only first number-like token
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;

    const [intPart, decPart = ''] = match[0].split('.');
    const dec2 = (decPart + '00').slice(0, 2);

    const cents = BigInt(intPart) * 100n + BigInt(dec2);
    return Number(cents) / 100;
  }

  function formatMoneyInput(value: string | number): string {
    const num = parseMoneyValue(value);
    return num.toFixed(2);
  }

  // Returns null only when the input is empty.
  // IMPORTANT: "0" is a valid value and must be saved/propagated as 0.
  function parseMoneyNullable(value: unknown): number | null {
    const raw = (value ?? '').toString().trim();
    if (!raw) return null;

    const parsed = parseMoneyValue(raw);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  // Resolve value using the same rules everywhere:
  // 1. If user typed a value (including 0) => use it directly (no pro-rata)
  // 2. If individual plantonista value exists => use it (with pro-rata if applicable)
  // 3. If useSectorDefault => sector default (with pro-rata if applicable)
  // 4. Else => null (blank)
  function resolveValue(params: {
    raw: unknown;
    sector_id: string | null;
    start_time: string;
    end_time?: string;
    user_id?: string | null;
    useSectorDefault: boolean;
    applyProRata?: boolean; // If true, calculate value based on duration
  }): number | null {
    const rawStr = (params.raw ?? '').toString().trim();
    
    // If user typed a value explicitly, use it as-is
    if (rawStr) return parseMoneyNullable(rawStr);
    
    if (!params.useSectorDefault) return null;
    
    const endTime = params.end_time || (isNightShift(params.start_time, '') ? '07:00' : '19:00');
    const duration = calculateDurationHours(params.start_time, endTime);
    const shouldApplyProRata = params.applyProRata !== false && duration !== 12;
    
    // Check for individual plantonista value first
    if (params.user_id && params.user_id !== 'vago' && params.user_id !== 'disponivel') {
      const userValue = getUserSectorValue(params.sector_id, params.user_id, params.start_time);
      if (userValue !== null) {
        return shouldApplyProRata ? calculateProRataValue(userValue, duration) : userValue;
      }
    }
    
    // Fall back to sector default
    const sectorValue = getSectorDefaultValue(params.sector_id, params.start_time);
    return shouldApplyProRata ? calculateProRataValue(sectorValue, duration) : sectorValue;
  }

  // --- Reliable writes helpers (professional-grade) ---
  // PostgREST may return 204 even when the write succeeds (no representation returned).
  // We confirm the write via a follow-up SELECT to avoid "false failure" toasts.
  async function confirmShiftExists(shiftId: string): Promise<boolean> {
    const { data, error } = await supabase.from('shifts').select('id').eq('id', shiftId).maybeSingle();
    if (error) return false;
    return !!data?.id;
  }

  async function insertShiftAndGetId(payload: {
    tenant_id: string;
    title: string;
    hospital: string;
    location: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
    base_value: number | null;
    notes: string | null;
    sector_id: string | null;
    created_by?: string | null;
    updated_by?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase
      .from('shifts')
      .insert(payload)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return data.id;

    // Fallback: fetch the most recent matching shift
    const { data: found, error: findErr } = await supabase
      .from('shifts')
      .select('id')
      .eq('tenant_id', payload.tenant_id)
      .eq('shift_date', payload.shift_date)
      .eq('start_time', payload.start_time)
      .eq('end_time', payload.end_time)
      .eq('hospital', payload.hospital)
      .eq('sector_id', payload.sector_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr || !found?.id) {
      throw new Error('Plantão criado, mas não foi possível confirmar o ID.');
    }

    return found.id;
  }

  // Filter shifts by sector
  const filteredShifts = filterSector === 'all' 
    ? shifts 
    : shifts.filter(s => s.sector_id === filterSector);

  // Get shifts for a specific date, optionally filtered by sector context
  // When dayDialogSectorId is set (user clicked on a specific sector's day), 
  // only return shifts for that sector
  function getShiftsForDate(date: Date, sectorIdContext?: string | null) {
    const effectiveSectorId = sectorIdContext ?? (filterSector !== 'all' ? filterSector : null);
    return shifts.filter(s => 
      isSameDay(parseISO(s.shift_date), date) && 
      (effectiveSectorId ? s.sector_id === effectiveSectorId : true)
    );
  }
  
  // Convenience function for day dialog that uses dayDialogSectorId context
  function getShiftsForDayDialog(date: Date) {
    return getShiftsForDate(date, dayDialogSectorId);
  }

  // Get assignments for a shift
  function getAssignmentsForShift(shiftId: string) {
    return assignments.filter(a => a.shift_id === shiftId);
  }

  // Helper to resolve assignment name with fallback to members list
  function getAssignmentName(assignment: ShiftAssignment): string {
    // Primary: use profile name from RPC response
    if (assignment.profile?.name) {
      return assignment.profile.name;
    }
    // Fallback: look up in members list by user_id
    const member = members.find(m => m.user_id === assignment.user_id);
    if (member?.profile?.name) {
      return member.profile.name;
    }
    return 'Sem nome';
  }

  // Get pending offers for a shift
  function getOffersForShift(shiftId: string) {
    return shiftOffers.filter(o => o.shift_id === shiftId);
  }

  // Check if shift is available (marked in notes)
  function isShiftAvailable(shift: Shift) {
    return shift.notes?.includes('[DISPONÍVEL]');
  }

  // Calendar navigation
  const days = viewMode === 'month' 
    ? eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      })
    : eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
      });

  // Get day of week for first day of month (0-6, Sunday-Saturday)
  const firstDayOfWeek = viewMode === 'month' ? startOfMonth(currentDate).getDay() : 0;

  // Create empty cells for days before the first day of month
  const emptyCells = Array(firstDayOfWeek).fill(null);

  // Navigation handlers
  function navigatePrev() {
    if (viewMode === 'month') {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(subWeeks(currentDate, 1));
    }
  }

  function navigateNext() {
    if (viewMode === 'month') {
      setCurrentDate(addMonths(currentDate, 1));
    } else {
      setCurrentDate(addWeeks(currentDate, 1));
    }
  }

  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTenantId) return;

    // Generate title automatically based on time and assignment type
    let autoTitle = generateShiftTitle(formData.start_time, formData.end_time);
    
    // Add status to notes for tracking
    let shiftNotes = formData.notes || '';
    if (formData.assigned_user_id === 'disponivel') {
      shiftNotes = `[DISPONÍVEL] ${shiftNotes}`.trim();
    } else if (formData.assigned_user_id === 'vago') {
      shiftNotes = `[VAGO] ${shiftNotes}`.trim();
    }

    const shiftInsertData = {
      tenant_id: currentTenantId,
      title: autoTitle,
      hospital: formData.hospital,
      location: formData.location || null,
      shift_date: formData.shift_date,
      start_time: formData.start_time,
      end_time: formData.end_time,
      // IMPORTANT: allow "em branco" (null) and apply sector default only when enabled.
      base_value: resolveValue({
        raw: formData.base_value,
        sector_id: formData.sector_id || null,
        start_time: formData.start_time,
        end_time: formData.end_time,
        useSectorDefault: formData.use_sector_default,
        applyProRata: true,
      }),
      notes: shiftNotes || null,
      sector_id: formData.sector_id || null,
      created_by: user?.id,
      updated_by: user?.id,
    };

    // For UPDATEs, avoid touching immutable/ownership fields like tenant_id and created_by.
    const shiftUpdateData = {
      title: shiftInsertData.title,
      hospital: shiftInsertData.hospital,
      location: shiftInsertData.location,
      shift_date: shiftInsertData.shift_date,
      start_time: shiftInsertData.start_time,
      end_time: shiftInsertData.end_time,
      base_value: shiftInsertData.base_value,
      notes: shiftInsertData.notes,
      sector_id: shiftInsertData.sector_id,
      updated_by: user?.id,
    };

    if (editingShift) {
      // UPDATE
      // PostgREST can return 204 (no body) even when update succeeded.
      // So we treat "no returned row" as "unknown" and confirm with a follow-up SELECT.
      const { data: updatedShift, error } = await supabase
        .from('shifts')
        .update(shiftUpdateData)
        .eq('id', editingShift.id)
        .select('id')
        .maybeSingle();

      if (error) {
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
        return;
      }

      const confirmed = updatedShift?.id ? true : await confirmShiftExists(editingShift.id);
      if (!confirmed) {
        toast({
          title: 'Não foi possível salvar',
          description: 'Atualização bloqueada (permissão/tenant).',
          variant: 'destructive',
        });
        return;
      }

      // Handle assignment update when editing
      try {
        const currentAssignment = assignments.find(a => a.shift_id === editingShift.id);

        const isRealUser =
          formData.assigned_user_id &&
          formData.assigned_user_id !== 'vago' &&
          formData.assigned_user_id !== 'disponivel';

        const assignedValue = resolveValue({
          raw: formData.base_value,
          sector_id: formData.sector_id || null,
          start_time: formData.start_time,
          end_time: formData.end_time,
          user_id: formData.assigned_user_id,
          useSectorDefault: formData.use_sector_default,
          applyProRata: true,
        });

        if (isRealUser) {
          if (currentAssignment) {
            if (currentAssignment.user_id === formData.assigned_user_id) {
              // Same user - just update value
              const { data: updData, error: updErr } = await supabase
                .from('shift_assignments')
                .update({ assigned_value: assignedValue, updated_by: user?.id })
                .eq('id', currentAssignment.id)
                .select('id')
                .maybeSingle();
              if (updErr) throw updErr;
              if (!updData) throw new Error('Atualização do plantonista bloqueada (permissão/tenant).');
            } else {
              // Different user - this is a TRANSFER
              const oldUserName = getAssignmentName(currentAssignment);
              const newUserMember = members.find(m => m.user_id === formData.assigned_user_id);
              const newUserName = newUserMember?.profile?.name || 'Desconhecido';
              
              const { data: upData, error: upErr } = await supabase
                .from('shift_assignments')
                .upsert(
                  {
                    tenant_id: currentTenantId,
                    shift_id: editingShift.id,
                    user_id: formData.assigned_user_id,
                    assigned_value: assignedValue,
                    created_by: user?.id,
                    updated_by: user?.id,
                  },
                  { onConflict: 'shift_id,user_id' }
                )
                .select('id');
              if (upErr) throw upErr;
              if (!upData || upData.length === 0) {
                throw new Error('Não foi possível salvar o plantonista (permissão/tenant).');
              }

              const { data: delData, error: delErr } = await supabase
                .from('shift_assignments')
                .delete()
                .eq('id', currentAssignment.id)
                .select('id');
              if (delErr) throw delErr;
              if (!delData || delData.length === 0) {
                throw new Error('Não foi possível remover o plantonista anterior (permissão/tenant).');
              }

              // Record two separate movements:
              // 1. Old user is REMOVED from this sector (destination unknown = sem destino)
              // 2. New user is ADDED to this sector (may be converted to transfer if they were recently removed from another sector)
              const shiftDate = parseISO(editingShift.shift_date);
              
              // Record old user as REMOVED (they leave without a known destination)
              await recordScheduleMovement({
                tenant_id: currentTenantId,
                month: shiftDate.getMonth() + 1,
                year: shiftDate.getFullYear(),
                user_id: currentAssignment.user_id,
                user_name: oldUserName,
                movement_type: 'removed',
                source_sector_id: editingShift.sector_id || null,
                source_sector_name: getSectorName(editingShift.sector_id, editingShift.hospital),
                source_shift_date: editingShift.shift_date,
                source_shift_time: `${editingShift.start_time.slice(0, 5)}-${editingShift.end_time.slice(0, 5)}`,
                source_assignment_id: currentAssignment.id,
                reason: `Substituído por ${newUserName}`,
                performed_by: user?.id ?? '',
              });
              
              // Record new user as ADDED (they enter this sector)
              await recordScheduleMovement({
                tenant_id: currentTenantId,
                month: shiftDate.getMonth() + 1,
                year: shiftDate.getFullYear(),
                user_id: formData.assigned_user_id,
                user_name: newUserName,
                movement_type: 'added',
                destination_sector_id: editingShift.sector_id || null,
                destination_sector_name: getSectorName(editingShift.sector_id, editingShift.hospital),
                destination_shift_date: editingShift.shift_date,
                destination_shift_time: `${editingShift.start_time.slice(0, 5)}-${editingShift.end_time.slice(0, 5)}`,
                reason: `Substituiu ${oldUserName}`,
                performed_by: user?.id ?? '',
              });
            }
          } else {
            // No previous assignment - this is an ADD
            const { data: upData, error: upErr } = await supabase
              .from('shift_assignments')
              .upsert(
                {
                  tenant_id: currentTenantId,
                  shift_id: editingShift.id,
                  user_id: formData.assigned_user_id,
                  assigned_value: assignedValue,
                  created_by: user?.id,
                  updated_by: user?.id,
                },
                { onConflict: 'shift_id,user_id' }
              )
              .select('id');
            if (upErr) throw upErr;
            if (!upData || upData.length === 0) {
              throw new Error('Não foi possível salvar o plantonista (permissão/tenant).');
            }

            // Record the movement: new user added
            const newUserMember = members.find(m => m.user_id === formData.assigned_user_id);
            const shiftDate = parseISO(editingShift.shift_date);
            await recordScheduleMovement({
              tenant_id: currentTenantId,
              month: shiftDate.getMonth() + 1,
              year: shiftDate.getFullYear(),
              user_id: formData.assigned_user_id,
              user_name: newUserMember?.profile?.name || 'Desconhecido',
              movement_type: 'added',
              destination_sector_id: editingShift.sector_id || null,
              destination_sector_name: getSectorName(editingShift.sector_id, editingShift.hospital),
              destination_shift_date: editingShift.shift_date,
              destination_shift_time: `${editingShift.start_time.slice(0, 5)}-${editingShift.end_time.slice(0, 5)}`,
              performed_by: user?.id ?? '',
            });
          }
        } else {
          // vago / disponível: garantir que não exista assignment
          if (currentAssignment) {
            // Record the removal before deleting
            const shiftDate = parseISO(editingShift.shift_date);
            await recordScheduleMovement({
              tenant_id: currentTenantId,
              month: shiftDate.getMonth() + 1,
              year: shiftDate.getFullYear(),
              user_id: currentAssignment.user_id,
              user_name: getAssignmentName(currentAssignment),
              movement_type: 'removed',
              source_sector_id: editingShift.sector_id || null,
              source_sector_name: getSectorName(editingShift.sector_id, editingShift.hospital),
              source_shift_date: editingShift.shift_date,
              source_shift_time: `${editingShift.start_time.slice(0, 5)}-${editingShift.end_time.slice(0, 5)}`,
              source_assignment_id: currentAssignment.id,
              performed_by: user?.id ?? '',
            });

            const { data: delData, error: delErr } = await supabase
              .from('shift_assignments')
              .delete()
              .eq('id', currentAssignment.id)
              .select('id');
            if (delErr) throw delErr;
            if (!delData || delData.length === 0) {
              throw new Error('Não foi possível remover o plantonista (permissão/tenant).');
            }
          }
        }
      } catch (assignmentError: any) {
        console.error('[ShiftCalendar] assignment update failed:', assignmentError);
        toast({
          title: 'Erro ao salvar plantão',
          description: assignmentError?.message || 'Falha ao atualizar o plantonista.',
          variant: 'destructive',
        });
        return;
      }

      // Duplicate for additional weeks if specified when editing
      const repeatWeeks = formData.repeat_weeks || 0;
      if (repeatWeeks > 0) {
        const baseDate = parseISO(formData.shift_date);

        for (let week = 1; week <= repeatWeeks; week++) {
          const newDate = addWeeks(baseDate, week);
          const duplicatedShiftData = {
            ...shiftInsertData,
            shift_date: format(newDate, 'yyyy-MM-dd'),
          };

          let duplicatedShiftId: string | null = null;
          try {
            duplicatedShiftId = await insertShiftAndGetId(duplicatedShiftData as any);
          } catch (dupError) {
            console.error(`Error duplicating shift for week ${week}:`, dupError);
            continue;
          }

          // Create assignment for duplicated shift if a plantonista was selected
          if (
            formData.assigned_user_id &&
            formData.assigned_user_id !== 'vago' &&
            formData.assigned_user_id !== 'disponivel' &&
            duplicatedShiftId
          ) {
            const assignedValue = resolveValue({
              raw: formData.base_value,
              sector_id: formData.sector_id || null,
              start_time: formData.start_time,
              end_time: formData.end_time,
              user_id: formData.assigned_user_id,
              useSectorDefault: formData.use_sector_default,
              applyProRata: true,
            });

            await supabase
              .from('shift_assignments')
              .upsert(
                {
                  tenant_id: currentTenantId,
                  shift_id: duplicatedShiftId,
                  user_id: formData.assigned_user_id,
                  assigned_value: assignedValue,
                  created_by: user?.id,
                  updated_by: user?.id,
                },
                { onConflict: 'shift_id,user_id' }
              );
          }
        }

        console.info('[ShiftCalendar] shift updated', {
          shiftId: editingShift.id,
          tenantId: currentTenantId,
          repeatWeeks,
        });
        toast({ title: `Plantão atualizado e ${repeatWeeks} cópias criadas!` });
      } else {
        console.info('[ShiftCalendar] shift updated', {
          shiftId: editingShift.id,
          tenantId: currentTenantId,
        });
        toast({ title: 'Plantão atualizado!' });
      }

      await fetchData();
      closeShiftDialog();
      setDayDialogOpen(false);
      return;
    } else {
      // CREATE
      const quantity = Math.max(1, Math.min(20, Number(formData.quantity) || 1));
      const repeatWeeks = formData.repeat_weeks || 0;

      // Helper to check if a user_id is a real user (not vago/disponivel)
      const isRealUserId = (userId: string | undefined | null): boolean => {
        return !!userId && userId !== 'vago' && userId !== 'disponivel';
      };

      let createdCount = 0;
      let errorsCount = 0;

      const baseDate = parseISO(formData.shift_date);

      // If multiShifts is filled, use it (one entry per shift) otherwise replicate form values
      const rows = (multiShifts.length > 0 ? multiShifts : Array.from({ length: quantity }).map(() => ({
        user_id: formData.assigned_user_id,
        start_time: formData.start_time,
        end_time: formData.end_time,
      })))
        .slice(0, quantity);

      for (let week = 0; week <= repeatWeeks; week++) {
        const weekDate = format(addWeeks(baseDate, week), 'yyyy-MM-dd');

        for (const row of rows) {
          const rowAssigned = row.user_id;

          // Notes markers
          let notes = (formData.notes || '').trim();
          if (!rowAssigned || rowAssigned === 'vago') notes = `[VAGO] ${notes}`.trim();
          if (rowAssigned === 'disponivel') notes = `[DISPONÍVEL] ${notes}`.trim();

          let createdShiftId: string;
            try {
              createdShiftId = await insertShiftAndGetId({
                ...shiftInsertData,
                shift_date: weekDate,
                start_time: row.start_time,
                end_time: row.end_time,
                title: generateShiftTitle(row.start_time, row.end_time),
                notes: notes || null,
              });
            } catch (e: any) {
              console.error('[ShiftCalendar] create shift failed:', {
                message: e?.message,
                details: e,
                payload: { ...shiftInsertData, shift_date: weekDate, start_time: row.start_time, end_time: row.end_time },
              });
              errorsCount++;
              continue;
            }

          createdCount++;

          // Create assignment if a real user was selected for THIS row
          if (isRealUserId(rowAssigned)) {
            // Calculate assigned_value per row (using row's start_time, end_time, and user_id for individual pricing)
            const rowAssignedValue = resolveValue({
              raw: formData.base_value,
              sector_id: formData.sector_id || null,
              start_time: row.start_time,
              end_time: row.end_time,
              user_id: rowAssigned,
              useSectorDefault: formData.use_sector_default,
              applyProRata: true,
            });

            const { error: assignErr } = await supabase
              .from('shift_assignments')
              .upsert(
                {
                  tenant_id: currentTenantId,
                  shift_id: createdShiftId,
                  user_id: rowAssigned,
                  assigned_value: rowAssignedValue,
                  created_by: user?.id,
                  updated_by: user?.id,
                },
                { onConflict: 'shift_id,user_id' }
              );

            if (assignErr) {
              console.error('[ShiftCalendar] assignment failed:', assignErr);
              errorsCount++;
            }
          }
        }
      }

      if (errorsCount > 0) {
        toast({
          title: `Criados: ${createdCount} • Erros: ${errorsCount}`,
          description: 'Alguns plantões não puderam ser salvos. Veja o console para detalhes.',
          variant: 'destructive',
        });
      } else {
        toast({ title: `${createdCount} plantão(ões) criado(s)!` });
      }

      await fetchData();
      closeShiftDialog();
      setDayDialogOpen(false);
      return;
    }
  }

  // Helper to sort members alphabetically by name
  function sortMembersAlphabetically(membersList: Member[]): Member[] {
    return [...membersList].sort((a, b) => {
      const nameA = (a.profile?.name || 'Sem nome').toLowerCase();
      const nameB = (b.profile?.name || 'Sem nome').toLowerCase();
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }

  // Toggle shift selection for bulk operations
  function toggleShiftSelection(shiftId: string) {
    setSelectedShiftIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(shiftId)) {
        newSet.delete(shiftId);
      } else {
        newSet.add(shiftId);
      }
      return newSet;
    });
  }

  // Toggle date selection for bulk create
  function toggleDateSelection(dateStr: string) {
    setSelectedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateStr)) {
        newSet.delete(dateStr);
      } else {
        newSet.add(dateStr);
      }
      return newSet;
    });
  }

  // Select all visible shifts
  function selectAllShifts() {
    const allIds = new Set(filteredShifts.map(s => s.id));
    setSelectedShiftIds(allIds);
  }

  // Clear all selections
  function clearSelection() {
    setSelectedShiftIds(new Set());
    setSelectedDates(new Set());
  }

  // Exit bulk mode
  function exitBulkMode() {
    setBulkMode(false);
    clearSelection();
  }

  // Bulk delete shifts
  async function handleBulkDelete() {
    if (selectedShiftIds.size === 0) {
      toast({ title: 'Nenhum plantão selecionado', variant: 'destructive' });
      return;
    }

    if (!confirm(`Deseja excluir ${selectedShiftIds.size} plantão(ões)? Esta ação não pode ser desfeita.`)) return;

    const idsToDelete = Array.from(selectedShiftIds);
    let successCount = 0;
    let errorCount = 0;

    for (const id of idsToDelete) {
      const { error } = await supabase.from('shifts').delete().eq('id', id);
      if (error) {
        errorCount++;
      } else {
        successCount++;
      }
    }

    if (errorCount > 0) {
      toast({ 
        title: `${successCount} excluídos, ${errorCount} erros`, 
        variant: 'destructive' 
      });
    } else {
      toast({ title: `${successCount} plantão(ões) excluído(s)!` });
    }

    clearSelection();
    fetchData();
    setDayDialogOpen(false);
  }

  // Bulk create shifts for selected dates
  async function handleBulkCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTenantId || selectedDates.size === 0) return;

    let autoTitle = generateShiftTitle(formData.start_time, formData.end_time);
    let shiftNotes = formData.notes || '';
    if (formData.assigned_user_id === 'disponivel') {
      shiftNotes = `[DISPONÍVEL] ${shiftNotes}`.trim();
    } else if (formData.assigned_user_id === 'vago') {
      shiftNotes = `[VAGO] ${shiftNotes}`.trim();
    }

    const sortedDates = Array.from(selectedDates).sort();
    let successCount = 0;
    let errorCount = 0;

    for (const dateStr of sortedDates) {
      const shiftData = {
        tenant_id: currentTenantId,
        title: autoTitle,
        hospital: formData.hospital,
        location: formData.location || null,
        shift_date: dateStr,
        start_time: formData.start_time,
        end_time: formData.end_time,
        base_value: resolveValue({
          raw: formData.base_value,
          sector_id: formData.sector_id || null,
          start_time: formData.start_time,
          end_time: formData.end_time,
          useSectorDefault: formData.use_sector_default,
          applyProRata: true,
        }),
        notes: shiftNotes || null,
        sector_id: formData.sector_id || null,
        created_by: user?.id,
        updated_by: user?.id,
      };

      const { data: newShift, error } = await supabase
        .from('shifts')
        .insert(shiftData)
        .select()
        .single();

      if (error) {
        errorCount++;
        continue;
      }
      successCount++;

      // Create assignment if a real user was selected
      if (formData.assigned_user_id && 
          formData.assigned_user_id !== 'vago' && 
          formData.assigned_user_id !== 'disponivel' && 
          newShift) {
        const assignedValue = resolveValue({
          raw: formData.base_value,
          sector_id: formData.sector_id || null,
          start_time: formData.start_time,
          end_time: formData.end_time,
          user_id: formData.assigned_user_id,
          useSectorDefault: formData.use_sector_default,
          applyProRata: true,
        });

        await supabase.from('shift_assignments').upsert({
          tenant_id: currentTenantId,
          shift_id: newShift.id,
          user_id: formData.assigned_user_id,
          assigned_value: assignedValue,
          created_by: user?.id,
          updated_by: user?.id,
        }, { onConflict: 'shift_id,user_id' });
      }
    }

    if (errorCount > 0) {
      toast({ 
        title: `${successCount} criados, ${errorCount} erros`, 
        variant: 'destructive' 
      });
    } else {
      toast({ title: `${successCount} plantão(ões) criado(s)!` });
    }

    clearSelection();
    setBulkCreateDialogOpen(false);
    closeShiftDialog();
    fetchData();
  }

  // Helper to sort shifts by time, then by plantonista name alphabetically
  function sortShiftsByTimeAndName(shiftsToSort: Shift[]): Shift[] {
    return [...shiftsToSort].sort((a, b) => {
      // First sort by start_time
      const timeCompare = a.start_time.localeCompare(b.start_time);
      if (timeCompare !== 0) return timeCompare;
      
      // If same time, sort by plantonista name alphabetically
      const assignmentA = assignments.find(asg => asg.shift_id === a.id);
      const assignmentB = assignments.find(asg => asg.shift_id === b.id);
      const nameA = (assignmentA?.profile?.name || 'ZZZZZ').toLowerCase(); // Put unassigned at end
      const nameB = (assignmentB?.profile?.name || 'ZZZZZ').toLowerCase();
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }

  async function handleDeleteShift(id: string) {
    if (!confirm('Deseja excluir este plantão e todas as atribuições?')) return;

    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Plantão excluído!' });
      fetchData();
      setDayDialogOpen(false);
    }
  }

  // Copy schedule from current month to target month by DAY OF WEEK + occurrence in month
  // Example: shifts on the 1st Monday of the source month will be copied to the 1st Monday of the target month.
  async function handleCopySchedule() {
    if (!currentTenantId || !copyTargetMonth || copyInProgress) return;

    setCopyInProgress(true);

    try {
      const sourceMonthStart = startOfMonth(currentDate);
      const sourceMonthEnd = endOfMonth(currentDate);

      // Always fetch the full source month (the UI might be on week view, which only loads a subset)
      const shiftsRes = await supabase
        .from('shifts')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .gte('shift_date', format(sourceMonthStart, 'yyyy-MM-dd'))
        .lte('shift_date', format(sourceMonthEnd, 'yyyy-MM-dd'))
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (shiftsRes.error) {
        toast({ title: 'Erro ao carregar plantões', description: shiftsRes.error.message, variant: 'destructive' });
        return;
      }

      const monthShifts = (shiftsRes.data || []) as Shift[];
      const shiftsToProcess = filterSector === 'all' ? monthShifts : monthShifts.filter(s => s.sector_id === filterSector);

      if (shiftsToProcess.length === 0) {
        toast({
          title: 'Nenhum plantão para copiar',
          description: 'Este mês não tem plantões cadastrados para o filtro atual.',
          variant: 'destructive',
        });
        return;
      }

      // Fetch assignments for the source shifts we will copy
      const sourceShiftIds = shiftsToProcess.map(s => s.id);
      const assignmentsRes = await supabase
        .from('shift_assignments')
        .select('id, shift_id, user_id, assigned_value, status, profile:profiles!shift_assignments_user_id_profiles_fkey(name)')
        .in('shift_id', sourceShiftIds);

      if (assignmentsRes.error) {
        toast({ title: 'Erro ao carregar atribuições', description: assignmentsRes.error.message, variant: 'destructive' });
        return;
      }

      const sourceAssignments = (assignmentsRes.data || []) as unknown as ShiftAssignment[];
      const assignmentsByShiftId = new Map<string, ShiftAssignment[]>();
      for (const a of sourceAssignments) {
        if (!assignmentsByShiftId.has(a.shift_id)) assignmentsByShiftId.set(a.shift_id, []);
        assignmentsByShiftId.get(a.shift_id)!.push(a);
      }

      // Build list of dates in source month grouped by weekday, to compute the occurrence index (1st Monday, 2nd Monday...)
      const sourceDates = eachDayOfInterval({ start: sourceMonthStart, end: sourceMonthEnd });
      const sourceDatesByWeekday = new Map<number, Date[]>();
      for (const d of sourceDates) {
        const wd = d.getDay();
        if (!sourceDatesByWeekday.has(wd)) sourceDatesByWeekday.set(wd, []);
        sourceDatesByWeekday.get(wd)!.push(d);
      }

      // Group shifts by weekday + occurrence index within month
      const shiftsByWeekdayAndIndex = new Map<number, Map<number, Shift[]>>();
      for (const shift of shiftsToProcess) {
        const shiftDate = parseISO(shift.shift_date);
        const wd = shiftDate.getDay();
        const list = sourceDatesByWeekday.get(wd) || [];
        const idx = list.findIndex(d => isSameDay(d, shiftDate));
        if (idx < 0) continue;

        if (!shiftsByWeekdayAndIndex.has(wd)) shiftsByWeekdayAndIndex.set(wd, new Map());
        const byIdx = shiftsByWeekdayAndIndex.get(wd)!;
        if (!byIdx.has(idx)) byIdx.set(idx, []);
        byIdx.get(idx)!.push(shift);
      }

      // Target month weekday date lists (ordered)
      const targetMonthStart = startOfMonth(copyTargetMonth);
      const targetMonthEnd = endOfMonth(copyTargetMonth);
      const targetDates = eachDayOfInterval({ start: targetMonthStart, end: targetMonthEnd });
      const targetDatesByWeekday = new Map<number, Date[]>();
      for (const d of targetDates) {
        const wd = d.getDay();
        if (!targetDatesByWeekday.has(wd)) targetDatesByWeekday.set(wd, []);
        targetDatesByWeekday.get(wd)!.push(d);
      }

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const [wd, byIdx] of shiftsByWeekdayAndIndex) {
        const targetList = targetDatesByWeekday.get(wd) || [];

        for (const [idx, sourceShiftsForThatDay] of byIdx) {
          const targetDate = targetList[idx];
          if (!targetDate) {
            skippedCount += sourceShiftsForThatDay.length;
            continue;
          }

          const newShiftDateStr = format(targetDate, 'yyyy-MM-dd');

          for (const shift of sourceShiftsForThatDay) {
            const { data: newShift, error } = await supabase
              .from('shifts')
              .insert({
                tenant_id: currentTenantId,
                title: shift.title,
                hospital: shift.hospital,
                location: shift.location,
                shift_date: newShiftDateStr,
                start_time: shift.start_time,
                end_time: shift.end_time,
                base_value: shift.base_value,
                notes: shift.notes,
                sector_id: shift.sector_id,
                created_by: user?.id,
                updated_by: user?.id,
              })
              .select()
              .single();

            if (error) {
              errorCount++;
              continue;
            }

            successCount++;

            const shiftAssignments = assignmentsByShiftId.get(shift.id) || [];
            for (const assignment of shiftAssignments) {
              await supabase.from('shift_assignments').upsert({
                tenant_id: currentTenantId,
                shift_id: newShift.id,
                user_id: assignment.user_id,
                assigned_value: assignment.assigned_value,
                status: 'assigned',
                created_by: user?.id,
                updated_by: user?.id,
              }, { onConflict: 'shift_id,user_id' });
            }
          }
        }
      }

      let message = `${successCount} plantões copiados por dia da semana (1ª, 2ª, 3ª ocorrência...)`;
      if (skippedCount > 0) message += `. ${skippedCount} ignorado(s) (não existe essa ocorrência no mês destino)`;
      if (errorCount > 0) message += `. ${errorCount} erro(s)`;

      toast({ title: 'Escala copiada!', description: message });

      setCopyScheduleDialogOpen(false);
      setCopyTargetMonth(null);
      setCurrentDate(copyTargetMonth);
    } catch (error) {
      console.error('Error copying schedule:', error);
      toast({ title: 'Erro ao copiar escala', variant: 'destructive' });
    } finally {
      setCopyInProgress(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedShift || !currentTenantId) return;

    const assignedValue = parseMoneyNullable(assignData.assigned_value);
    
    // Check if there's already an assignment (to determine if this is an add or update)
    const existingAssignment = assignments.find(a => a.shift_id === selectedShift.id && a.user_id === assignData.user_id);
    
    const { error } = await supabase.from('shift_assignments').upsert({
      tenant_id: currentTenantId,
      shift_id: selectedShift.id,
      user_id: assignData.user_id,
      assigned_value: assignedValue,
      created_by: user?.id,
      updated_by: user?.id,
    }, { onConflict: 'shift_id,user_id' });

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Erro', description: 'Usuário já atribuído a este plantão', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao atribuir', description: error.message, variant: 'destructive' });
      }
    } else {
      // Record the movement if this is a new assignment (not an update) and schedule is finalized
      if (!existingAssignment && user?.id) {
        const assignedMember = members.find(m => m.user_id === assignData.user_id);
        const shiftDate = parseISO(selectedShift.shift_date);
        await recordScheduleMovement({
          tenant_id: currentTenantId,
          month: shiftDate.getMonth() + 1,
          year: shiftDate.getFullYear(),
          user_id: assignData.user_id,
          user_name: assignedMember?.profile?.name || 'Desconhecido',
          movement_type: 'added',
          destination_sector_id: selectedShift.sector_id || null,
          destination_sector_name: getSectorName(selectedShift.sector_id, selectedShift.hospital),
          destination_shift_date: selectedShift.shift_date,
          destination_shift_time: `${selectedShift.start_time.slice(0, 5)}-${selectedShift.end_time.slice(0, 5)}`,
          performed_by: user.id,
        });
      }
      toast({ title: 'Usuário atribuído!' });
      fetchData();
      setAssignDialogOpen(false);
      setAssignData({ user_id: '', assigned_value: '' });
    }
  }

  async function handleRemoveAssignment(assignmentId: string, shiftId?: string) {
    if (!confirm('Deseja remover este usuário do plantão?')) return;

    // Get assignment details before deleting for movement tracking
    const assignmentToRemove = assignments.find(a => a.id === assignmentId);
    const relatedShift = shiftId ? shifts.find(s => s.id === shiftId) : 
      (assignmentToRemove ? shifts.find(s => s.id === assignmentToRemove.shift_id) : null);
    
    const { error } = await supabase.from('shift_assignments').delete().eq('id', assignmentId);
    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    } else {
      // Record the movement if schedule is finalized
      if (assignmentToRemove && relatedShift && currentTenantId && user?.id) {
        const shiftDate = parseISO(relatedShift.shift_date);
        await recordScheduleMovement({
          tenant_id: currentTenantId,
          month: shiftDate.getMonth() + 1,
          year: shiftDate.getFullYear(),
          user_id: assignmentToRemove.user_id,
          user_name: assignmentToRemove.profile?.name || 'Desconhecido',
          movement_type: 'removed',
          source_sector_id: relatedShift.sector_id || null,
          source_sector_name: getSectorName(relatedShift.sector_id, relatedShift.hospital),
          source_shift_date: relatedShift.shift_date,
          source_shift_time: `${relatedShift.start_time.slice(0, 5)}-${relatedShift.end_time.slice(0, 5)}`,
          source_assignment_id: assignmentId,
          performed_by: user.id,
        });
      }
      toast({ title: 'Usuário removido do plantão!' });
      fetchData();
    }
  }

  // Accept a pending offer and assign the plantonista to the shift
  async function handleAcceptOffer(offer: ShiftOffer, shift: Shift) {
    if (!currentTenantId || !user?.id) return;

    try {
      // Create assignment for the offered plantonista
      const { error: assignError } = await supabase.from('shift_assignments').upsert({
        tenant_id: currentTenantId,
        shift_id: offer.shift_id,
        user_id: offer.user_id,
        assigned_value: shift.base_value,
        created_by: user.id,
        updated_by: user.id,
      }, { onConflict: 'shift_id,user_id' });

      if (assignError) {
        toast({ title: 'Erro ao aceitar oferta', description: assignError.message, variant: 'destructive' });
        return;
      }

      // Update this offer to accepted
      await supabase
        .from('shift_offers')
        .update({ 
          status: 'accepted', 
          reviewed_by: user.id, 
          reviewed_at: new Date().toISOString() 
        })
        .eq('id', offer.id);

      // Reject other pending offers for this shift
      await supabase
        .from('shift_offers')
        .update({ 
          status: 'rejected', 
          reviewed_by: user.id, 
          reviewed_at: new Date().toISOString() 
        })
        .eq('shift_id', offer.shift_id)
        .eq('status', 'pending')
        .neq('id', offer.id);

      // Remove [DISPONÍVEL] from shift notes
      const updatedNotes = (shift.notes || '').replace('[DISPONÍVEL]', '').trim();
      await supabase
        .from('shifts')
        .update({ notes: updatedNotes || null, updated_by: user.id })
        .eq('id', shift.id);

      toast({ title: 'Oferta aceita!', description: `${offer.profile?.name} foi atribuído ao plantão.` });
      fetchData();
    } catch (error) {
      console.error('Error accepting offer:', error);
      toast({ title: 'Erro ao aceitar oferta', variant: 'destructive' });
    }
  }

  async function handleRejectOffer(offerId: string) {
    if (!user?.id) return;

    const { error } = await supabase
      .from('shift_offers')
      .update({ 
        status: 'rejected', 
        reviewed_by: user.id, 
        reviewed_at: new Date().toISOString() 
      })
      .eq('id', offerId);

    if (error) {
      toast({ title: 'Erro ao rejeitar oferta', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Oferta rejeitada' });
      fetchData();
    }
  }

  function openCreateShift(date?: Date, sectorIdOverride?: string) {
    if (shiftDialogCloseGuardRef.current) return;

    // Use the override sector or the current filter if viewing a specific sector
    const effectiveSectorId = sectorIdOverride || (filterSector !== 'all' ? filterSector : sectors[0]?.id || '');
    const effectiveSector = sectors.find(s => s.id === effectiveSectorId);

    setEditingShift(null);
    setFormData({
      hospital: effectiveSector?.name || sectors[0]?.name || '',
      location: '',
      shift_date: date ? format(date, 'yyyy-MM-dd') : '',
      start_time: '07:00',
      end_time: '19:00',
      base_value: '',
      notes: '',
      sector_id: effectiveSectorId,
      assigned_user_id: '',
      duration_hours: '',
      repeat_weeks: 0,
      quantity: 1,
      use_sector_default: true,
    });
    setShiftDialogOpen(true);
  }

  function openDayView(date: Date, sectorId?: string) {
    setSelectedDate(date);
    setDayDialogSectorId(sectorId || null);
    setDayDialogOpen(true);
  }

  function openEditShift(shift: Shift) {
    if (shiftDialogCloseGuardRef.current) return;

    setEditingShift(shift);
    // Get current assignment for this shift
    const currentAssignment = assignments.find(a => a.shift_id === shift.id);
    setFormData({
      hospital: shift.hospital,
      location: shift.location || '',
      shift_date: shift.shift_date,
      start_time: shift.start_time.slice(0, 5), // Remove seconds
      end_time: shift.end_time.slice(0, 5), // Remove seconds
      base_value: formatMoneyInput(shift.base_value ?? ''),
      notes: shift.notes || '',
      sector_id: shift.sector_id || '',
      assigned_user_id: currentAssignment?.user_id || '',
      duration_hours: '',
      repeat_weeks: 0,
      quantity: 1,
      // IMPORTANT: if the admin clears/zeros the value, apply sector default by default.
      // They can still uncheck if they want to keep it blank (null).
      use_sector_default: true,
    });
    setShiftDialogOpen(true);
  }

  function closeShiftDialog() {
    // Guard against immediate reopen caused by click-through/focus restore quirks.
    // Common culprit: user submits with Enter, dialog closes, focus returns to the trigger,
    // and the Enter keyup "clicks" it again.
    shiftDialogCloseGuardRef.current = true;

    const active = document.activeElement as HTMLElement | null;
    active?.blur();

    const stopEnter = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    window.addEventListener('keyup', stopEnter, true);
    window.setTimeout(() => {
      window.removeEventListener('keyup', stopEnter, true);
    }, 400);

    window.setTimeout(() => {
      shiftDialogCloseGuardRef.current = false;
    }, 800);

    setShiftDialogOpen(false);
    setEditingShift(null);
    setMultiShifts([]);
    setFormData({
      hospital: '',
      location: '',
      shift_date: '',
      start_time: '',
      end_time: '',
      base_value: '',
      notes: '',
      sector_id: '',
      assigned_user_id: '',
      duration_hours: '',
      repeat_weeks: 0,
      quantity: 1,
      use_sector_default: true,
    });
  }

  function closeBulkEditDialog() {
    // The bulk edit dialog is typically opened from a button in the day dialog.
    // When closing, Radix may restore focus to that trigger; if the user submitted with Enter,
    // the keyup can immediately "click" the trigger again, re-opening the dialog.
    bulkEditDialogCloseGuardRef.current = true;

    // Hard-disable the trigger briefly to avoid click-through (mouse up) on the underlying button.
    setBulkEditTriggerDisabled(true);

    const active = document.activeElement as HTMLElement | null;
    active?.blur();

    const stopEnter = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    window.addEventListener('keyup', stopEnter, true);
    window.setTimeout(() => {
      window.removeEventListener('keyup', stopEnter, true);
    }, 400);

    window.setTimeout(() => {
      bulkEditDialogCloseGuardRef.current = false;
      setBulkEditTriggerDisabled(false);
    }, 800);

    setBulkEditDialogOpen(false);
    setBulkEditData([]);
    setBulkEditShifts([]);
  }

  // Open bulk edit dialog with sector context from day dialog
  function openBulkEditDialog(date: Date, sectorIdContext?: string | null) {
    if (bulkEditDialogCloseGuardRef.current) return;

    // Use sector context if provided, otherwise use dayDialogSectorId
    const effectiveSectorId = sectorIdContext ?? dayDialogSectorId;
    const dayShifts = getShiftsForDate(date, effectiveSectorId);
    if (dayShifts.length === 0) return;

    setBulkEditShifts(dayShifts);
    setBulkEditData(
      dayShifts.map((shift) => {
        const currentAssignment = assignments.find((a) => a.shift_id === shift.id);
        return {
          id: shift.id,
          hospital: shift.hospital,
          location: shift.location || '',
          start_time: shift.start_time.slice(0, 5),
          end_time: shift.end_time.slice(0, 5),
          base_value: formatMoneyInput(shift.base_value),
          notes: shift.notes || '',
          sector_id: shift.sector_id || '',
          assigned_user_id: currentAssignment?.user_id || '',
        };
      })
    );
    setBulkEditDialogOpen(true);
  }
  function openBulkApplySelectedDialog(date: Date) {
    const dayShiftIds = getShiftsForDayDialog(date).map((s) => s.id);
    const selectedInDay = dayShiftIds.filter((id) => selectedShiftIds.has(id));

    if (selectedInDay.length === 0) {
      toast({ title: 'Nenhum plantão selecionado', description: 'Selecione 1 ou mais plantões deste dia.', variant: 'destructive' });
      return;
    }

    setBulkApplyShiftIds(selectedInDay);
    setBulkApplyData({ title: '', start_time: '', end_time: '', base_value: '', assigned_user_id: '' });
    setBulkApplyDialogOpen(true);
  }

  async function handleBulkApplySave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id || !currentTenantId) return;

    const hasAnyChange =
      bulkApplyData.title.trim() ||
      bulkApplyData.start_time ||
      bulkApplyData.end_time ||
      bulkApplyData.base_value.trim() ||
      bulkApplyData.assigned_user_id;

    if (!hasAnyChange) {
      toast({ title: 'Nada para aplicar', description: 'Preencha ao menos um campo para aplicar aos selecionados.', variant: 'destructive' });
      return;
    }

    const shiftIds = bulkApplyShiftIds;
    if (shiftIds.length === 0) return;

    try {
      const shiftUpdate: Partial<Pick<Shift, 'title' | 'start_time' | 'end_time' | 'base_value'>> & { updated_by: string } = {
        updated_by: user.id,
      };

      if (bulkApplyData.title.trim()) shiftUpdate.title = bulkApplyData.title.trim();
      if (bulkApplyData.start_time) shiftUpdate.start_time = bulkApplyData.start_time;
      if (bulkApplyData.end_time) shiftUpdate.end_time = bulkApplyData.end_time;
      if (bulkApplyData.base_value.trim()) shiftUpdate.base_value = parseMoneyValue(bulkApplyData.base_value);

      const needsShiftUpdate = Object.keys(shiftUpdate).length > 1;

      if (needsShiftUpdate) {
        const { error } = await supabase.from('shifts').update(shiftUpdate).in('id', shiftIds);
        if (error) throw error;
      }

      // Assignment (plantonista) update
      if (bulkApplyData.assigned_user_id) {
        const valueToApply = (() => {
          const raw = bulkApplyData.base_value.trim();
          if (!raw) return undefined; // keep existing
          return parseMoneyValue(raw); // includes 0
        })();

        if (bulkApplyData.assigned_user_id === '__clear__') {
          const { error } = await supabase.from('shift_assignments').delete().in('shift_id', shiftIds);
          if (error) throw error;
        } else {
          await Promise.all(
            shiftIds.map(async (shiftId) => {
              // To avoid unique constraint issues (shift_id,user_id), treat bulk-apply assignee as a replace:
              // 1) remove existing assignees for the shift
              // 2) upsert the chosen assignee
              const valueToApplyFinal = valueToApply; // can be undefined (keep) or number

              const { error: delErr } = await supabase
                .from('shift_assignments')
                .delete()
                .eq('shift_id', shiftId);
              if (delErr) throw delErr;

              const upsertPayload: any = {
                tenant_id: currentTenantId,
                shift_id: shiftId,
                user_id: bulkApplyData.assigned_user_id,
                assigned_value: valueToApplyFinal ?? null,
                created_by: user.id,
                updated_by: user.id,
              };

              const { error: upErr } = await supabase
                .from('shift_assignments')
                .upsert(upsertPayload, { onConflict: 'shift_id,user_id' });
              if (upErr) throw upErr;
            })
          );
        }
      }

      toast({ title: 'Edição em bloco aplicada!', description: `${shiftIds.length} plantão(ões) atualizados.` });
      setBulkApplyDialogOpen(false);
      setBulkApplyShiftIds([]);
      setBulkApplyData({ title: '', start_time: '', end_time: '', base_value: '', assigned_user_id: '' });
      setSelectedShiftIds(new Set());
      setDayDialogOpen(false);
      setDayDialogSectorId(null);
      fetchData();
    } catch (error: any) {
      console.error('Error applying bulk edits:', error);
      toast({ title: 'Erro ao aplicar', description: error?.message || 'Ocorreu um erro ao aplicar as alterações.', variant: 'destructive' });
    }
  }

  async function handleBulkEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id || !currentTenantId) return;

    try {
      for (const editData of bulkEditData) {
        const originalShift = bulkEditShifts.find(s => s.id === editData.id);
        if (!originalShift) continue;

        // Update the shift
        const { error: shiftError } = await supabase
          .from('shifts')
          .update({
            hospital: editData.hospital,
            location: editData.location || null,
            start_time: editData.start_time,
            end_time: editData.end_time,
            base_value: parseMoneyNullable(editData.base_value),
            notes: editData.notes || null,
            sector_id: editData.sector_id || null,
            title: generateShiftTitle(editData.start_time, editData.end_time),
            updated_by: user.id,
          })
          .eq('id', editData.id);

        if (shiftError) {
          console.error('Error updating shift:', shiftError);
          continue;
        }

        // Handle assignment changes
        try {
          const currentAssignment = assignments.find(a => a.shift_id === editData.id);

          if (editData.assigned_user_id && editData.assigned_user_id !== 'vago' && editData.assigned_user_id !== 'disponivel') {
            const assignedValue = parseMoneyNullable(editData.base_value);

            if (currentAssignment) {
              if (currentAssignment.user_id === editData.assigned_user_id) {
                // Same user - just update value
                const { error: updErr } = await supabase
                  .from('shift_assignments')
                  .update({ assigned_value: assignedValue, updated_by: user.id })
                  .eq('id', currentAssignment.id);
                if (updErr) throw updErr;
              } else {
                // Different user - this is a SUBSTITUTION (not a transfer)
                // The old user is REMOVED, the new user is ADDED
                const oldUserName = getAssignmentName(currentAssignment);
                const newUserMember = members.find(m => m.user_id === editData.assigned_user_id);
                const newUserName = newUserMember?.profile?.name || 'Desconhecido';
                
                const { error: upErr } = await supabase
                  .from('shift_assignments')
                  .upsert(
                    {
                      tenant_id: currentTenantId,
                      shift_id: editData.id,
                      user_id: editData.assigned_user_id,
                      assigned_value: assignedValue,
                      created_by: user.id,
                      updated_by: user.id,
                    },
                    { onConflict: 'shift_id,user_id' }
                  );
                if (upErr) throw upErr;

                const { error: delErr } = await supabase
                  .from('shift_assignments')
                  .delete()
                  .eq('id', currentAssignment.id);
                if (delErr) throw delErr;

                // Record the REMOVAL of the old user (substitution means they're out, not transferred)
                const shiftDate = parseISO(originalShift.shift_date);
                await recordScheduleMovement({
                  tenant_id: currentTenantId,
                  month: shiftDate.getMonth() + 1,
                  year: shiftDate.getFullYear(),
                  user_id: currentAssignment.user_id,
                  user_name: oldUserName,
                  movement_type: 'removed',
                  source_sector_id: originalShift.sector_id || null,
                  source_sector_name: getSectorName(originalShift.sector_id, originalShift.hospital),
                  source_shift_date: originalShift.shift_date,
                  source_shift_time: `${originalShift.start_time.slice(0, 5)}-${originalShift.end_time.slice(0, 5)}`,
                  source_assignment_id: currentAssignment.id,
                  reason: `Substituído por ${newUserName}`,
                  performed_by: user.id,
                });

                // Record the ADDITION of the new user
                await recordScheduleMovement({
                  tenant_id: currentTenantId,
                  month: shiftDate.getMonth() + 1,
                  year: shiftDate.getFullYear(),
                  user_id: editData.assigned_user_id,
                  user_name: newUserName,
                  movement_type: 'added',
                  destination_sector_id: originalShift.sector_id || null,
                  destination_sector_name: getSectorName(originalShift.sector_id, originalShift.hospital),
                  destination_shift_date: originalShift.shift_date,
                  destination_shift_time: `${originalShift.start_time.slice(0, 5)}-${originalShift.end_time.slice(0, 5)}`,
                  reason: `Substituiu ${oldUserName}`,
                  performed_by: user.id,
                });
              }
            } else {
              // No previous assignment - this is an ADD
              const { error: upErr } = await supabase
                .from('shift_assignments')
                .upsert(
                  {
                    tenant_id: currentTenantId,
                    shift_id: editData.id,
                    user_id: editData.assigned_user_id,
                    assigned_value: assignedValue,
                    created_by: user.id,
                    updated_by: user.id,
                  },
                  { onConflict: 'shift_id,user_id' }
                );
              if (upErr) throw upErr;

              // Record the addition
              const newUserMember = members.find(m => m.user_id === editData.assigned_user_id);
              const shiftDate = parseISO(originalShift.shift_date);
              await recordScheduleMovement({
                tenant_id: currentTenantId,
                month: shiftDate.getMonth() + 1,
                year: shiftDate.getFullYear(),
                user_id: editData.assigned_user_id,
                user_name: newUserMember?.profile?.name || 'Desconhecido',
                movement_type: 'added',
                destination_sector_id: originalShift.sector_id || null,
                destination_sector_name: getSectorName(originalShift.sector_id, originalShift.hospital),
                destination_shift_date: originalShift.shift_date,
                destination_shift_time: `${originalShift.start_time.slice(0, 5)}-${originalShift.end_time.slice(0, 5)}`,
                performed_by: user.id,
              });
            }

            // Remove [DISPONÍVEL] if present
            if (originalShift.notes?.includes('[DISPONÍVEL]')) {
              const { error: noteErr } = await supabase
                .from('shifts')
                .update({ notes: (editData.notes || '').replace('[DISPONÍVEL]', '').trim() || null })
                .eq('id', editData.id);
              if (noteErr) throw noteErr;
            }
          } else if (editData.assigned_user_id === 'disponivel') {
            // Make available - remove assignment if exists
            if (currentAssignment) {
              // Record the removal before deleting
              const shiftDate = parseISO(originalShift.shift_date);
              await recordScheduleMovement({
                tenant_id: currentTenantId,
                month: shiftDate.getMonth() + 1,
                year: shiftDate.getFullYear(),
                user_id: currentAssignment.user_id,
                user_name: getAssignmentName(currentAssignment),
                movement_type: 'removed',
                source_sector_id: originalShift.sector_id || null,
                source_sector_name: getSectorName(originalShift.sector_id, originalShift.hospital),
                source_shift_date: originalShift.shift_date,
                source_shift_time: `${originalShift.start_time.slice(0, 5)}-${originalShift.end_time.slice(0, 5)}`,
                source_assignment_id: currentAssignment.id,
                performed_by: user.id,
              });

              const { error: delErr } = await supabase
                .from('shift_assignments')
                .delete()
                .eq('id', currentAssignment.id);
              if (delErr) throw delErr;
            }

            // Add [DISPONÍVEL] tag
            const newNotes = editData.notes?.includes('[DISPONÍVEL]')
              ? editData.notes
              : `[DISPONÍVEL] ${editData.notes || ''}`.trim();

            const { error: noteErr } = await supabase
              .from('shifts')
              .update({ notes: newNotes })
              .eq('id', editData.id);
            if (noteErr) throw noteErr;
          } else {
            // Vago - remove assignment if exists
            if (currentAssignment) {
              // Record the removal before deleting
              const shiftDate = parseISO(originalShift.shift_date);
              await recordScheduleMovement({
                tenant_id: currentTenantId,
                month: shiftDate.getMonth() + 1,
                year: shiftDate.getFullYear(),
                user_id: currentAssignment.user_id,
                user_name: getAssignmentName(currentAssignment),
                movement_type: 'removed',
                source_sector_id: originalShift.sector_id || null,
                source_sector_name: getSectorName(originalShift.sector_id, originalShift.hospital),
                source_shift_date: originalShift.shift_date,
                source_shift_time: `${originalShift.start_time.slice(0, 5)}-${originalShift.end_time.slice(0, 5)}`,
                source_assignment_id: currentAssignment.id,
                performed_by: user.id,
              });

              const { error: delErr } = await supabase
                .from('shift_assignments')
                .delete()
                .eq('id', currentAssignment.id);
              if (delErr) throw delErr;
            }

            // Remove [DISPONÍVEL] if present
            if (originalShift.notes?.includes('[DISPONÍVEL]')) {
              const { error: noteErr } = await supabase
                .from('shifts')
                .update({ notes: (editData.notes || '').replace('[DISPONÍVEL]', '').trim() || null })
                .eq('id', editData.id);
              if (noteErr) throw noteErr;
            }
          }
        } catch (assignmentError: any) {
          console.error('[ShiftCalendar] bulk edit assignment failed:', assignmentError);
          toast({
            title: 'Erro ao salvar plantão',
            description: assignmentError?.message || 'Falha ao atualizar o plantonista.',
            variant: 'destructive',
          });
        }
      }

      toast({ title: 'Plantões atualizados!', description: 'Alterações aplicadas. Se algum plantão não salvar, você verá uma mensagem de erro.' });
      closeBulkEditDialog();
      // After saving "Editar Todos", also close the day dialog to avoid the impression
      // that the edit flow reopened automatically.
      setDayDialogOpen(false);
      setDayDialogSectorId(null);
      setSelectedDate(null);
      fetchData();
    } catch (error) {
      console.error('Error saving bulk edits:', error);
      toast({ title: 'Erro ao salvar', description: 'Ocorreu um erro ao salvar os plantões.', variant: 'destructive' });
    }
  }

  function openAssignDialog(shift: Shift) {
    setSelectedShift(shift);
    setAssignData({ user_id: '', assigned_value: shift.base_value.toString() });
    setAssignDialogOpen(true);
  }

  // Render calendar grid for a given set of shifts
  function renderCalendarGrid(
    shiftsToRender: Shift[],
    options?: { hideSectorName?: boolean; sectorContextId?: string }
  ) {
    function getShiftsForDateFiltered(date: Date) {
      return shiftsToRender.filter(s => isSameDay(parseISO(s.shift_date), date));
    }

    return (
      <>
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
            <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-1">
          {emptyCells.map((_, index) => (
            <div key={`empty-${index}`} className={viewMode === 'week' ? 'min-h-[200px]' : 'min-h-[120px]'} />
          ))}
          
          {days.map(day => {
            const dayShifts = getShiftsForDateFiltered(day);
            const hasShifts = dayShifts.length > 0;
            const dateStr = format(day, 'yyyy-MM-dd');
            const isDateSelected = selectedDates.has(dateStr);
            const dayHasSelectedShifts = dayShifts.some(s => selectedShiftIds.has(s.id));
            
            return (
              <div
                key={day.toISOString()}
                className={`${viewMode === 'week' ? 'min-h-[200px]' : 'min-h-[120px]'} p-1 border rounded-lg cursor-pointer transition-colors
                  ${isToday(day) ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'}
                  ${bulkMode && isDateSelected ? 'ring-2 ring-primary bg-primary/10' : ''}
                  ${bulkMode && dayHasSelectedShifts ? 'ring-2 ring-destructive bg-destructive/10' : ''}
                `}
                onClick={() => {
                  // Always open day view on click - bulk selection is done via checkboxes
                  openDayView(day, options?.sectorContextId);
                }}
              >
                <div className={`flex items-center justify-between text-sm font-medium mb-1 ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                  <span>
                    {format(day, 'd')}
                    {viewMode === 'week' && (
                      <span className="text-muted-foreground ml-1 text-xs">
                        {format(day, 'EEE', { locale: ptBR })}
                      </span>
                    )}
                  </span>
                  {bulkMode && !hasShifts && (
                    <Checkbox 
                      checked={isDateSelected}
                      onCheckedChange={() => toggleDateSelection(dateStr)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4"
                    />
                  )}
                </div>
                
                {hasShifts && (
                  <div className="space-y-1">
                    {sortShiftsByTimeAndName(dayShifts).slice(0, viewMode === 'week' ? 8 : 4).map(shift => {
                      const shiftAssignments = getAssignmentsForShift(shift.id);
                      const shiftPendingOffers = getOffersForShift(shift.id);
                      const sectorColor = getSectorColor(shift.sector_id, shift.hospital);
                      const sectorName = getSectorName(shift.sector_id, shift.hospital);
                      const isNight = isNightShift(shift.start_time, shift.end_time);
                      const isAvailable = isShiftAvailable(shift);
                      const showSectorName = !options?.hideSectorName && filterSector === 'all';
                      const isShiftSelected = selectedShiftIds.has(shift.id);
                      
                      // Determine what to show for each shift:
                      // - If has assignments: show assigned plantonistas
                      // - If available and has offers: show "DISPONÍVEL" + offer names
                      // - If available and no offers: show "DISPONÍVEL"
                      // - Otherwise: show "VAGO"
                      
                      return (
                        <div
                          key={shift.id}
                          className={`text-xs p-1.5 rounded ${isNight ? 'ring-1 ring-indigo-400/30' : ''} ${bulkMode && isShiftSelected ? 'ring-2 ring-destructive' : ''}`}
                          style={{ 
                            backgroundColor: isNight ? '#e0e7ff' : `${sectorColor}20`,
                            borderLeft: `3px solid ${isNight ? '#6366f1' : sectorColor}`
                          }}
                          title={`${shift.title} - ${sectorName} ${isNight ? '(Noturno)' : '(Diurno)'}`}
                          onClick={(e) => {
                            if (bulkMode) {
                              e.stopPropagation();
                              toggleShiftSelection(shift.id);
                            }
                          }}
                        >
                          {bulkMode && (
                            <div className="flex justify-end mb-1">
                              <Checkbox 
                                checked={isShiftSelected}
                                onCheckedChange={() => toggleShiftSelection(shift.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-3 w-3"
                              />
                            </div>
                          )}
                          {showSectorName && (
                            <div className="flex items-center gap-1">
                              {isNight ? (
                                <Moon className="h-3 w-3 text-indigo-600" />
                              ) : (
                                <Sun className="h-3 w-3 text-amber-500" />
                              )}
                              <span className="font-semibold text-foreground leading-tight break-words whitespace-normal">
                                {sectorName}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {!showSectorName && (
                              isNight ? (
                                <Moon className="h-2.5 w-2.5 text-indigo-600" />
                              ) : (
                                <Sun className="h-2.5 w-2.5 text-amber-500" />
                              )
                            )}
                            <Clock className="h-2.5 w-2.5" />
                            {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                          </div>
                          
                          {/* Display assignment status */}
                          <div className="mt-1 space-y-0.5">
                            {shiftAssignments.length > 0 ? (
                              // Has assigned plantonistas - show each one sorted alphabetically
                              [...shiftAssignments].sort((a, b) => {
                                const nameA = getAssignmentName(a).toLowerCase();
                                const nameB = getAssignmentName(b).toLowerCase();
                                return nameA.localeCompare(nameB, 'pt-BR');
                              }).map(a => (
                                <div 
                                  key={a.id} 
                                  className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-background/80 text-foreground font-medium"
                                >
                                  <Users className="h-2.5 w-2.5 flex-shrink-0 text-primary" />
                                  <span className="truncate">{getAssignmentName(a)}</span>
                                </div>
                              ))
                            ) : isAvailable ? (
                              // Available shift - show status + offers
                              <>
                                <div className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-bold">
                                  📋 DISPONÍVEL
                                </div>
                                {shiftPendingOffers.length > 0 && (
                                  shiftPendingOffers.map(offer => (
                                    <div 
                                      key={offer.id} 
                                      className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-green-100 text-green-700 font-medium"
                                    >
                                      ✋ {offer.profile?.name || 'Plantonista'}
                                    </div>
                                  ))
                                )}
                              </>
                            ) : (
                              // Vacant shift
                              <div className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-red-100 text-red-700 font-bold">
                                ⚠️ VAGO
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {dayShifts.length > (viewMode === 'week' ? 8 : 4) && (
                      <div className="text-xs text-muted-foreground text-center">
                        +{dayShifts.length - (viewMode === 'week' ? 8 : 4)} mais
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // Print schedule function - Calendar visual format
  function handlePrintSchedule() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Erro', description: 'Não foi possível abrir a janela de impressão', variant: 'destructive' });
      return;
    }

    const activeSector = filterSector !== 'all' ? sectors.find(s => s.id === filterSector) : null;
    const scheduleName = activeSector ? activeSector.name : 'Todos os Setores';
    const sectorColor = activeSector?.color || '#22c55e';
    const periodLabel = format(currentDate, 'MMMM yyyy', { locale: ptBR });

    // Get calendar days for the current month
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const firstDayOfWeek = monthStart.getDay();

    // Group shifts by date for quick lookup
    const shiftsByDate: Record<string, Shift[]> = {};
    filteredShifts.forEach(shift => {
      if (!shiftsByDate[shift.shift_date]) {
        shiftsByDate[shift.shift_date] = [];
      }
      shiftsByDate[shift.shift_date].push(shift);
    });

    // Sort shifts within each date by start_time
    Object.keys(shiftsByDate).forEach(dateStr => {
      shiftsByDate[dateStr].sort((a, b) => a.start_time.localeCompare(b.start_time));
    });

    // Generate calendar cells HTML
    let calendarCells = '';
    
    // Empty cells before first day
    for (let i = 0; i < firstDayOfWeek; i++) {
      calendarCells += '<div class="calendar-cell empty"></div>';
    }

    // Calendar days
    calendarDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayShifts = shiftsByDate[dateStr] || [];
      const dayNum = format(day, 'd');
      const dayName = format(day, 'EEE', { locale: ptBR });
      const isCurrentDay = isToday(day);
      
      let shiftsHtml = '';
      dayShifts.forEach(shift => {
        const shiftAssignments = getAssignmentsForShift(shift.id);
        const isNight = isNightShift(shift.start_time, shift.end_time);
        const bgColor = isNight ? '#e0e7ff' : `${sectorColor}20`;
        const borderColor = isNight ? '#6366f1' : sectorColor;
        const timeIcon = isNight ? '🌙' : '☀️';
        
        let assigneeText = '';
        if (shiftAssignments.length > 0) {
          // Sort assignees alphabetically by name
          const sortedAssignments = [...shiftAssignments].sort((a, b) => {
            const nameA = getAssignmentName(a).toLowerCase();
            const nameB = getAssignmentName(b).toLowerCase();
            return nameA.localeCompare(nameB, 'pt-BR');
          });
          assigneeText = sortedAssignments.map(a => {
            const name = getAssignmentName(a);
            // Truncate long names
            return name.length > 15 ? name.substring(0, 15) + '...' : name;
          }).join(', ');
        } else if (shift.notes?.includes('[DISPONÍVEL]')) {
          assigneeText = '<span class="available">DISPONÍVEL</span>';
        } else {
          assigneeText = '<span class="vacant">VAGO</span>';
        }

        shiftsHtml += `
          <div class="shift-card" style="background: ${bgColor}; border-left: 3px solid ${borderColor};">
            <div class="shift-time">${timeIcon} ${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}</div>
            <div class="shift-assignee">${assigneeText}</div>
          </div>
        `;
      });

      calendarCells += `
        <div class="calendar-cell ${isCurrentDay ? 'today' : ''}">
          <div class="day-header">
            <span class="day-num">${dayNum}</span>
            <span class="day-name">${dayName}</span>
          </div>
          <div class="shifts-container">
            ${shiftsHtml}
          </div>
        </div>
      `;
    });

    // Calculate stats
    const vacantShifts = filteredShifts.filter(s => {
      const hasAssignment = getAssignmentsForShift(s.id).length > 0;
      return !hasAssignment && !s.notes?.includes('[DISPONÍVEL]');
    }).length;
    const availableShifts = filteredShifts.filter(s => s.notes?.includes('[DISPONÍVEL]')).length;
    const assignedShifts = filteredShifts.filter(s => getAssignmentsForShift(s.id).length > 0).length;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Escala - ${scheduleName} - ${periodLabel}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            padding: 15px; 
            color: #333;
            background: #fff;
          }
          .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid ${sectorColor};
          }
          .sector-dot {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: ${sectorColor};
          }
          h1 { 
            font-size: 22px;
            font-weight: 600;
            color: #1a1a1a; 
          }
          .period {
            font-size: 16px;
            color: #666;
            text-transform: capitalize;
            margin-left: auto;
          }
          .stats { 
            display: flex; 
            gap: 15px; 
            margin-bottom: 15px; 
          }
          .stat-card { 
            padding: 10px 15px; 
            background: #f5f5f5; 
            border-radius: 8px; 
            text-align: center;
            flex: 1;
          }
          .stat-number { font-size: 20px; font-weight: bold; }
          .stat-label { font-size: 10px; color: #666; text-transform: uppercase; }
          
          .calendar-header {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 2px;
            margin-bottom: 2px;
          }
          .weekday {
            text-align: center;
            font-weight: 600;
            font-size: 11px;
            color: #666;
            padding: 8px 0;
            background: #f8f9fa;
          }
          .calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 2px;
          }
          .calendar-cell {
            min-height: 90px;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            padding: 4px;
            background: #fff;
          }
          .calendar-cell.empty {
            background: #f9fafb;
            border-color: transparent;
          }
          .calendar-cell.today {
            border-color: ${sectorColor};
            background: ${sectorColor}08;
          }
          .day-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
          }
          .day-num {
            font-weight: 600;
            font-size: 12px;
            color: #1a1a1a;
          }
          .day-name {
            font-size: 9px;
            color: #999;
            text-transform: uppercase;
          }
          .shifts-container {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .shift-card {
            padding: 3px 5px;
            border-radius: 3px;
            font-size: 8px;
          }
          .shift-time {
            font-weight: 500;
            color: #374151;
          }
          .shift-assignee {
            color: #1a1a1a;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .vacant {
            color: #dc2626;
            font-weight: bold;
          }
          .available {
            color: #2563eb;
            font-weight: bold;
          }
          .footer { 
            margin-top: 15px; 
            padding-top: 10px; 
            border-top: 1px solid #ddd; 
            font-size: 10px; 
            color: #999;
            display: flex;
            justify-content: space-between;
          }
          @media print {
            body { padding: 10px; }
            .calendar-cell { min-height: 80px; }
          }
          @page {
            size: landscape;
            margin: 10mm;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="sector-dot"></div>
          <h1>${scheduleName}</h1>
          <div class="period">${periodLabel}</div>
        </div>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stat-number">${filteredShifts.length}</div>
            <div class="stat-label">Total</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #22c55e;">${assignedShifts}</div>
            <div class="stat-label">Preenchidos</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #2563eb;">${availableShifts}</div>
            <div class="stat-label">Disponíveis</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #dc2626;">${vacantShifts}</div>
            <div class="stat-label">Vagos</div>
          </div>
        </div>

        <div class="calendar-header">
          <div class="weekday">Dom</div>
          <div class="weekday">Seg</div>
          <div class="weekday">Ter</div>
          <div class="weekday">Qua</div>
          <div class="weekday">Qui</div>
          <div class="weekday">Sex</div>
          <div class="weekday">Sáb</div>
        </div>

        <div class="calendar-grid">
          ${calendarCells}
        </div>

        <div class="footer">
          <span>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
          <span>MedEscala</span>
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  // Stats
  const totalShifts = filteredShifts.length;
  const totalAssignments = assignments.length;
  const uniqueWorkers = [...new Set(assignments.map(a => a.user_id))].length;

  // Conflict detection interface
  interface ShiftConflict {
    id: string;
    userId: string;
    userName: string;
    date: string;
    shifts: {
      shiftId: string;
      sectorName: string;
      startTime: string;
      endTime: string;
      assignmentId: string;
    }[];
  }

  // Detect conflicts: same person assigned to overlapping shifts on the same date
  function detectConflicts(): ShiftConflict[] {
    const conflicts: ShiftConflict[] = [];
    
    // Group assignments by user and date
    const userDateAssignments: Record<string, {
      userId: string;
      userName: string;
      date: string;
      shifts: {
        shiftId: string;
        sectorName: string;
        startTime: string;
        endTime: string;
        assignmentId: string;
      }[];
    }> = {};

    assignments.forEach(assignment => {
      const shift = shifts.find(s => s.id === assignment.shift_id);
      if (!shift) return;

      const key = `${assignment.user_id}_${shift.shift_date}`;
      
      if (!userDateAssignments[key]) {
        userDateAssignments[key] = {
          userId: assignment.user_id,
          userName: assignment.profile?.name || 'Sem nome',
          date: shift.shift_date,
          shifts: []
        };
      }

      userDateAssignments[key].shifts.push({
        shiftId: shift.id,
        sectorName: getSectorName(shift.sector_id, shift.hospital),
        startTime: shift.start_time,
        endTime: shift.end_time,
        assignmentId: assignment.id
      });
    });

    // Check for overlapping shifts - only include shifts that actually overlap
    Object.entries(userDateAssignments).forEach(([key, data]) => {
      if (data.shifts.length > 1) {
        // Find shifts that actually overlap with at least one other shift
        const overlappingShifts: typeof data.shifts = [];
        
        data.shifts.forEach((s1, i) => {
          const hasOverlapWithAnother = data.shifts.some((s2, j) => {
            if (i === j) return false;
            
            const s1Start = parseInt(s1.startTime.replace(':', ''));
            const s1End = parseInt(s1.endTime.replace(':', ''));
            const s2Start = parseInt(s2.startTime.replace(':', ''));
            const s2End = parseInt(s2.endTime.replace(':', ''));
            
            // Handle overnight shifts - add 2400 if end time is before start time
            const s1EndAdjusted = s1End <= s1Start ? s1End + 2400 : s1End;
            const s2EndAdjusted = s2End <= s2Start ? s2End + 2400 : s2End;
            
            // For overnight comparison, also adjust start if comparing across midnight
            const s1StartAdjusted = s1Start;
            const s2StartAdjusted = s2Start;
            
            // Check overlap: two intervals overlap if one starts before the other ends
            // Strictly less than (<) means touching endpoints (07:00-19:00 and 19:00-07:00) don't overlap
            return s1StartAdjusted < s2EndAdjusted && s2StartAdjusted < s1EndAdjusted;
          });
          
          if (hasOverlapWithAnother && !overlappingShifts.some(os => os.shiftId === s1.shiftId)) {
            overlappingShifts.push(s1);
          }
        });

        if (overlappingShifts.length > 1) {
          conflicts.push({
            id: key,
            userId: data.userId,
            userName: data.userName,
            date: data.date,
            shifts: overlappingShifts // Only include shifts that actually overlap
          });
        }
      }
    });

    return conflicts;
  }

  const conflicts = detectConflicts();
  const unresolvedConflicts = conflicts.filter(c => !acknowledgedConflicts.has(c.id));

  // Open justification dialog instead of immediate acknowledge
  function handleAcknowledgeConflict(conflict: ShiftConflict) {
    setPendingAcknowledgeConflict(conflict);
    setJustificationText('');
    setJustificationDialogOpen(true);
  }

  // Confirm acknowledge with justification
  async function confirmAcknowledgeConflict() {
    if (!pendingAcknowledgeConflict || !justificationText.trim() || !currentTenantId || !user?.id) {
      toast({ title: 'Informe a justificativa', variant: 'destructive' });
      return;
    }

    // Save to conflict_resolutions table
    const { error } = await supabase.from('conflict_resolutions').insert({
      tenant_id: currentTenantId,
      conflict_date: pendingAcknowledgeConflict.date,
      plantonista_id: pendingAcknowledgeConflict.userId,
      plantonista_name: pendingAcknowledgeConflict.userName,
      resolution_type: 'acknowledged',
      justification: justificationText.trim(),
      conflict_details: pendingAcknowledgeConflict.shifts,
      resolved_by: user.id,
    });

    if (error) {
      toast({ title: 'Erro ao salvar resolução', description: error.message, variant: 'destructive' });
      return;
    }

    setAcknowledgedConflicts(prev => new Set([...prev, pendingAcknowledgeConflict.id]));
    setJustificationDialogOpen(false);
    setPendingAcknowledgeConflict(null);
    setJustificationText('');
    toast({
      title: 'Conflito reconhecido',
      description: 'O conflito foi registrado com a justificativa informada.'
    });
  }

  // Prepare removal - show confirmation with context
  function prepareRemoveConflictAssignment(conflict: ShiftConflict, assignmentToRemove: ShiftConflict['shifts'][0]) {
    // Find all other assignments that will be kept (there might be more than one)
    const keptAssignments = conflict.shifts.filter(s => s.assignmentId !== assignmentToRemove.assignmentId);
    if (keptAssignments.length === 0) return;
    
    // Use the first one as primary for the record, but we'll store all in conflict_details
    const assignmentToKeep = keptAssignments[0];
    
    setPendingRemoval({ conflict, assignmentToRemove, assignmentToKeep });
    setRemoveConfirmDialogOpen(true);
  }

  // Confirm removal and save to history
  async function confirmRemoveConflictAssignment() {
    if (!pendingRemoval || !currentTenantId || !user?.id) return;
    
    const { conflict, assignmentToRemove, assignmentToKeep } = pendingRemoval;

    // Delete the assignment
    const { error: deleteError } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('id', assignmentToRemove.assignmentId);

    if (deleteError) {
      toast({ title: 'Erro ao remover atribuição', description: deleteError.message, variant: 'destructive' });
      return;
    }

    // Save to conflict_resolutions table
    const { error: insertError } = await supabase.from('conflict_resolutions').insert({
      tenant_id: currentTenantId,
      conflict_date: conflict.date,
      plantonista_id: conflict.userId,
      plantonista_name: conflict.userName,
      resolution_type: 'removed',
      removed_sector_name: assignmentToRemove.sectorName,
      removed_shift_time: `${assignmentToRemove.startTime.slice(0,5)} - ${assignmentToRemove.endTime.slice(0,5)}`,
      removed_assignment_id: assignmentToRemove.assignmentId,
      kept_sector_name: assignmentToKeep.sectorName,
      kept_shift_time: `${assignmentToKeep.startTime.slice(0,5)} - ${assignmentToKeep.endTime.slice(0,5)}`,
      kept_assignment_id: assignmentToKeep.assignmentId,
      conflict_details: conflict.shifts,
      resolved_by: user.id,
    });

    if (insertError) {
      console.error('Erro ao registrar resolução:', insertError);
      // Continue mesmo com erro no histórico
    }

    setRemoveConfirmDialogOpen(false);
    setPendingRemoval(null);
    toast({ title: 'Atribuição removida!', description: 'O conflito foi resolvido e registrado no histórico.' });
    fetchData();
  }

  // Fetch conflict resolution history
  async function fetchConflictHistory() {
    if (!currentTenantId) return;
    setLoadingHistory(true);
    
    const { data, error } = await supabase
      .from('conflict_resolutions')
      .select('*, resolved_by_profile:profiles!conflict_resolutions_resolved_by_fkey(name)')
      .eq('tenant_id', currentTenantId)
      .order('resolved_at', { ascending: false })
      .limit(100);
    
    if (error) {
      toast({ title: 'Erro ao carregar histórico', description: error.message, variant: 'destructive' });
    } else {
      setConflictHistory(data || []);
    }
    setLoadingHistory(false);
  }

  function openConflictHistory() {
    fetchConflictHistory();
    setConflictHistoryDialogOpen(true);
  }

  async function handleRemoveConflictAssignment(assignmentId: string) {
    if (!user?.id) return;
    
    const { error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      toast({ title: 'Erro ao remover atribuição', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Atribuição removida!', description: 'O conflito foi resolvido.' });
      fetchData();
    }
  }

  if (loading) {
    return <div className="text-muted-foreground p-4">Carregando calendário...</div>;
  }

  // Get current sector name for header
  const currentSectorName = filterSector === 'all' 
    ? 'Todos os Setores' 
    : sectors.find(s => s.id === filterSector)?.name || 'Setor';
  
  const currentSectorColor = filterSector !== 'all' 
    ? sectors.find(s => s.id === filterSector)?.color || '#22c55e'
    : null;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        {currentSectorColor && (
          <div 
            className="w-4 h-4 rounded-full" 
            style={{ backgroundColor: currentSectorColor }}
          />
        )}
        <div>
          <h2 className="text-2xl font-bold text-foreground">{currentSectorName}</h2>
          <p className="text-muted-foreground text-sm">
            {viewMode === 'month' 
              ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
              : `Semana de ${format(startOfWeek(currentDate, { weekStartsOn: 0 }), "dd/MM", { locale: ptBR })}`
            }
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalShifts}</p>
                <p className="text-xs text-muted-foreground">Plantões</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalAssignments}</p>
                <p className="text-xs text-muted-foreground">Atribuições</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{uniqueWorkers}</p>
                <p className="text-xs text-muted-foreground">Plantonistas Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{sectors.length}</p>
                <p className="text-xs text-muted-foreground">Setores</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Finalization Status - Per Sector */}
      {filterSector !== 'all' && (
        <ScheduleMovements 
          currentMonth={currentDate.getMonth() + 1} 
          currentYear={currentDate.getFullYear()}
          sectorId={filterSector}
          sectorName={sectors.find(s => s.id === filterSector)?.name || null}
        />
      )}
      
      {filterSector === 'all' && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <span className="font-bold text-amber-700 dark:text-amber-400">
                  ℹ️ Selecione um setor para finalizar a escala
                </span>
                <p className="text-sm text-muted-foreground">
                  A finalização de escalas é individual por setor. Selecione um setor específico no filtro acima.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conflict Alert */}
      {unresolvedConflicts.length > 0 && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="font-bold text-red-700 dark:text-red-400">
                  ⚠️ {unresolvedConflicts.length} Conflito{unresolvedConflicts.length > 1 ? 's' : ''} de Escala Detectado{unresolvedConflicts.length > 1 ? 's' : ''}
                </span>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="ml-auto"
                  onClick={() => setConflictDialogOpen(true)}
                >
                  Ver Detalhes
                </Button>
              </div>
              
              {/* Quick summary */}
              <div className="grid gap-2">
                {unresolvedConflicts.slice(0, 3).map(conflict => (
                  <div 
                    key={conflict.id}
                    className="flex flex-wrap items-center gap-2 text-sm bg-white dark:bg-background rounded p-2 border border-red-200"
                  >
                    <span className="font-semibold text-red-700 dark:text-red-400">
                      {conflict.userName}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      {format(parseISO(conflict.date), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-red-600">
                      Escalado em {conflict.shifts.length} locais ao mesmo tempo:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {conflict.shifts.map((s, i) => (
                        <Badge key={i} variant="outline" className="border-red-300 text-red-700">
                          {s.sectorName} ({s.startTime.slice(0, 5)}-{s.endTime.slice(0, 5)})
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {unresolvedConflicts.length > 3 && (
                  <p className="text-sm text-red-600">
                    + {unresolvedConflicts.length - 3} outro{unresolvedConflicts.length - 3 > 1 ? 's' : ''} conflito{unresolvedConflicts.length - 3 > 1 ? 's' : ''}...
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Layout: Calendar (full width now that sectors are in main sidebar) */}
      <div>
        {/* Calendar Area */}
        <div className="w-full">
          {/* Header Controls */}
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Navigation */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={navigatePrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-lg font-bold min-w-[180px] text-center">
                  {viewMode === 'month' 
                    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
                    : `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), "dd/MM", { locale: ptBR })} - ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), "dd/MM/yyyy", { locale: ptBR })}`
                  }
                </h2>
                <Button variant="outline" size="icon" onClick={navigateNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Bulk Mode Toggle */}
                {bulkMode ? (
                  <>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-primary/10 border border-primary/30">
                      <CheckSquare className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-primary">
                        {selectedShiftIds.size > 0 
                          ? `${selectedShiftIds.size} plantão(ões)` 
                          : selectedDates.size > 0 
                            ? `${selectedDates.size} data(s)`
                            : 'Modo Seleção'}
                      </span>
                    </div>
                    {selectedShiftIds.size > 0 && (
                      <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir ({selectedShiftIds.size})
                      </Button>
                    )}
                    {selectedDates.size > 0 && (
                      <Button size="sm" onClick={() => {
                        // Open bulk create dialog
                        const effectiveSectorId = filterSector !== 'all' ? filterSector : sectors[0]?.id || '';
                        const effectiveSector = sectors.find(s => s.id === effectiveSectorId);
                        setFormData({
                          hospital: effectiveSector?.name || sectors[0]?.name || '',
                          location: '',
                          shift_date: '',
                          start_time: '07:00',
                          end_time: '19:00',
                          base_value: '',
                          notes: '',
                          sector_id: effectiveSectorId,
                          assigned_user_id: '',
                          duration_hours: '',
                          repeat_weeks: 0,
                          quantity: 1,
                          use_sector_default: true,
                        });
                        setBulkCreateDialogOpen(true);
                      }}>
                        <Plus className="mr-2 h-4 w-4" />
                        Criar ({selectedDates.size})
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={clearSelection}>
                      Limpar
                    </Button>
                    <Button variant="outline" size="sm" onClick={exitBulkMode}>
                      <X className="mr-2 h-4 w-4" />
                      Sair
                    </Button>
                  </>
                ) : (
                  <>
                    {/* View Mode Toggle */}
                    <div className="flex border rounded-lg overflow-hidden">
                      <Button 
                        variant={viewMode === 'week' ? 'default' : 'ghost'} 
                        size="sm"
                        onClick={() => setViewMode('week')}
                        className="rounded-none"
                      >
                        Semana
                      </Button>
                      <Button 
                        variant={viewMode === 'month' ? 'default' : 'ghost'} 
                        size="sm"
                        onClick={() => setViewMode('month')}
                        className="rounded-none"
                      >
                        Mês
                      </Button>
                    </div>

                    <Button variant="outline" onClick={() => setBulkMode(true)}>
                      <CheckSquare className="mr-2 h-4 w-4" />
                      Seleção
                    </Button>

                    <Button 
                      variant="outline" 
                      onClick={() => {
                        if (filterSector === 'all') {
                          toast({ 
                            title: 'Selecione um setor', 
                            description: 'Para copiar a escala, primeiro selecione um setor específico na lista à esquerda.',
                            variant: 'destructive' 
                          });
                          return;
                        }
                        setCopyTargetMonth(addMonths(currentDate, 1));
                        setCopyScheduleDialogOpen(true);
                      }}
                      disabled={shifts.length === 0}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar Escala
                    </Button>

                    <Button variant="outline" onClick={handlePrintSchedule}>
                      <Printer className="mr-2 h-4 w-4" />
                      Imprimir
                    </Button>

                    <Button onClick={() => openCreateShift()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Plantão
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Calendar Content */}
          {filterSector === 'all' ? (
            <div className="space-y-6">
              {/* Summary Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <LayoutGrid className="h-5 w-5" />
                    Resumo - Todos os Setores
                    <Badge variant="secondary" className="ml-2">{shifts.length} plantões</Badge>
                  </CardTitle>
                </CardHeader>
              </Card>

              {/* Individual Sector Calendars */}
              {sectors.filter(sector => {
                const sectorShifts = shifts.filter(s => s.sector_id === sector.id);
                return sectorShifts.length > 0;
              }).map(sector => {
                const sectorShifts = shifts.filter(s => s.sector_id === sector.id);
                const sectorAssignments = assignments.filter(a => sectorShifts.some(s => s.id === a.shift_id));
                
                return (
                  <Card key={sector.id} style={{ borderColor: sector.color || '#22c55e', borderWidth: '2px' }}>
                    <CardHeader className="pb-2" style={{ backgroundColor: `${sector.color || '#22c55e'}10` }}>
                      <CardTitle className="text-lg flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-5 h-5 rounded-full" 
                            style={{ backgroundColor: sector.color || '#22c55e' }}
                          />
                          {sector.name}
                        </div>
                        <div className="flex items-center gap-3 text-sm font-normal">
                          <Badge variant="outline">{sectorShifts.length} plantões</Badge>
                          <Badge variant="outline">{sectorAssignments.length} atribuições</Badge>
                          <Badge variant="outline">{[...new Set(sectorAssignments.map(a => a.user_id))].length} plantonistas</Badge>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setFilterSector(sector.id)}
                          >
                            Ver apenas
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 sm:p-4">
                      {renderCalendarGrid(sectorShifts, { hideSectorName: true, sectorContextId: sector.id })}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Show message if no sectors have shifts */}
              {sectors.filter(sector => shifts.filter(s => s.sector_id === sector.id).length > 0).length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Nenhum plantão cadastrado neste período
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            (() => {
              const sector = sectors.find(s => s.id === filterSector);
              const sectorShifts = shifts.filter(s => s.sector_id === filterSector);
              const sectorAssignments = assignments.filter(a => sectorShifts.some(s => s.id === a.shift_id));
              
              if (!sector) return null;
              
              return (
                <Card style={{ borderColor: sector.color || '#22c55e', borderWidth: '2px' }}>
                  <CardHeader className="pb-2" style={{ backgroundColor: `${sector.color || '#22c55e'}10` }}>
                    <CardTitle className="text-lg flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-5 h-5 rounded-full" 
                          style={{ backgroundColor: sector.color || '#22c55e' }}
                        />
                        {sector.name}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-normal">
                        <Badge variant="outline">{sectorShifts.length} plantões</Badge>
                        <Badge variant="outline">{sectorAssignments.length} atribuições</Badge>
                        <Badge variant="outline">{[...new Set(sectorAssignments.map(a => a.user_id))].length} plantonistas</Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    {renderCalendarGrid(sectorShifts, { hideSectorName: true, sectorContextId: filterSector })}
                  </CardContent>
                </Card>
              );
            })()
          )}
        </div>
      </div>

      {/* Day Detail Dialog */}
      <Dialog
        open={dayDialogOpen}
        onOpenChange={(open) => {
          setDayDialogOpen(open);
          if (!open) setDayDialogSectorId(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                {dayDialogSectorId && (
                  <Badge variant="outline" className="ml-2">
                    {sectors.find(s => s.id === dayDialogSectorId)?.name}
                  </Badge>
                )}
              </span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {selectedDate && getShiftsForDayDialog(selectedDate).length > 0 && (
                  <>
                    {/* Select all in this day */}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const dayShiftIds = getShiftsForDayDialog(selectedDate).map(s => s.id);
                        const allSelected = dayShiftIds.every(id => selectedShiftIds.has(id));
                        if (allSelected) {
                          // Deselect all
                          setSelectedShiftIds(prev => {
                            const newSet = new Set(prev);
                            dayShiftIds.forEach(id => newSet.delete(id));
                            return newSet;
                          });
                        } else {
                          // Select all
                          setSelectedShiftIds(prev => {
                            const newSet = new Set(prev);
                            dayShiftIds.forEach(id => newSet.add(id));
                            return newSet;
                          });
                        }
                        if (!bulkMode) setBulkMode(true);
                      }}
                    >
                      <CheckSquare className="mr-2 h-4 w-4" />
                      {(() => {
                        const dayShiftIds = getShiftsForDayDialog(selectedDate).map(s => s.id);
                        const selectedCount = dayShiftIds.filter(id => selectedShiftIds.has(id)).length;
                        return selectedCount > 0 
                          ? `${selectedCount} selecionado(s)` 
                          : 'Selecionar todos';
                      })()}
                    </Button>
                    {(() => {
                      const dayShiftIds = getShiftsForDayDialog(selectedDate).map(s => s.id);
                      const selectedCount = dayShiftIds.filter(id => selectedShiftIds.has(id)).length;
                      if (selectedCount > 0) {
                        return (
                          <>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => {
                                handleBulkDelete();
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir ({selectedCount})
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (selectedDate) openBulkApplySelectedDialog(selectedDate);
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Editar selecionados ({selectedCount})
                            </Button>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}
                {selectedDate && getShiftsForDayDialog(selectedDate).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkEditTriggerDisabled}
                    onClick={() => {
                      if (bulkEditTriggerDisabled) return;
                      if (selectedDate) {
                        openBulkEditDialog(selectedDate);
                      }
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Editar Todos ({getShiftsForDayDialog(selectedDate).length})
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() =>
                    selectedDate && openCreateShift(selectedDate, dayDialogSectorId || undefined)
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {selectedDate && getShiftsForDayDialog(selectedDate).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum plantão neste dia
              </p>
            ) : (
              selectedDate && sortShiftsByTimeAndName(getShiftsForDayDialog(selectedDate)).map(shift => {
                const shiftAssignments = getAssignmentsForShift(shift.id);
                const shiftPendingOffers = getOffersForShift(shift.id);
                const sectorColor = getSectorColor(shift.sector_id, shift.hospital);
                const sectorName = getSectorName(shift.sector_id, shift.hospital);
                const isAvailable = isShiftAvailable(shift);
                const showSectorName = filterSector === 'all' && !dayDialogSectorId;
                const isShiftSelected = selectedShiftIds.has(shift.id);
                
                return (
                  <Card 
                    key={shift.id}
                    style={{ borderLeft: `4px solid ${sectorColor}` }}
                    className={isShiftSelected ? 'ring-2 ring-destructive' : ''}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {/* Checkbox for selection */}
                          <Checkbox 
                            checked={isShiftSelected}
                            onCheckedChange={() => {
                              toggleShiftSelection(shift.id);
                              if (!bulkMode) setBulkMode(true);
                            }}
                            className="mt-1"
                          />
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                            {showSectorName && (
                              <Badge 
                                variant="outline"
                                style={{ 
                                  borderColor: sectorColor,
                                  backgroundColor: `${sectorColor}20`
                                }}
                              >
                                {sectorName}
                              </Badge>
                            )}
                            {/* Status Badge */}
                            {shiftAssignments.length === 0 && (
                              isAvailable ? (
                                <Badge className="bg-blue-500 text-white">📋 DISPONÍVEL</Badge>
                              ) : (
                                <Badge variant="destructive">⚠️ VAGO</Badge>
                              )
                            )}
                          </div>
                          <CardTitle className="text-lg">{shift.title}</CardTitle>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
                            {shift.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {shift.location}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                            </span>
                            <span className="font-medium text-foreground">
                              R$ {(getShiftDisplayValue(shift) ?? 0).toFixed(2)}
                              {calculateDurationHours(shift.start_time, shift.end_time) !== 12 && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({calculateDurationHours(shift.start_time, shift.end_time).toFixed(0)}h)
                                </span>
                              )}
                            </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openAssignDialog(shift)}>
                            <UserPlus className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditShift(shift)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteShift(shift.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Assigned Plantonistas */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">Plantonistas Atribuídos:</div>
                            <Badge variant="secondary">{shiftAssignments.length} pessoa(s)</Badge>
                          </div>
                          {shiftAssignments.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">Nenhum plantonista atribuído</p>
                          ) : (
                            <div className="grid gap-2">
                              {[...shiftAssignments].sort((a, b) => {
                                const nameA = getAssignmentName(a).toLowerCase();
                                const nameB = getAssignmentName(b).toLowerCase();
                                return nameA.localeCompare(nameB, 'pt-BR');
                              }).map(assignment => (
                                <div 
                                  key={assignment.id} 
                                  className="flex items-center justify-between p-2 rounded-lg border bg-muted/40 text-foreground"
                                >
                                  <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-primary" />
                                    <div>
                                      <div className="font-medium text-sm">
                                        {getAssignmentName(assignment)}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        Valor: R$ {(getAssignmentDisplayValue(assignment, shift) ?? 0).toFixed(2)}
                                      </div>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveAssignment(assignment.id);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Pending Offers Section */}
                        {shiftPendingOffers.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium text-blue-700">✋ Ofertas Pendentes:</div>
                              <Badge className="bg-blue-100 text-blue-700">{shiftPendingOffers.length} oferta(s)</Badge>
                            </div>
                            <div className="grid gap-2">
                              {shiftPendingOffers.map(offer => (
                                <div 
                                  key={offer.id} 
                                  className="flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200"
                                >
                                  <div>
                                    <div className="font-medium text-sm text-blue-800">
                                      {offer.profile?.name || 'Plantonista'}
                                    </div>
                                    {offer.message && (
                                      <div className="text-xs text-blue-600 mt-1">
                                        "{offer.message}"
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                      onClick={() => handleAcceptOffer(offer, shift)}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Aceitar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                                      onClick={() => handleRejectOffer(offer.id)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Shift Dialog */}
      <Dialog
        open={shiftDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeShiftDialog();
            return;
          }

          // Ignore immediate reopen right after a programmatic close
          if (shiftDialogCloseGuardRef.current) return;
          setShiftDialogOpen(true);
        }}
      >
        <DialogContent
          className="max-w-md max-h-[85vh] overflow-y-auto"
          onCloseAutoFocus={(e) => {
            // Prevent focus from returning to the trigger (edit button), which can cause an immediate re-open.
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Editar Plantão' : 'Novo Plantão'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateShift} className="space-y-4">
            {/* Show sector selector only if viewing "all" or editing */}
            {(filterSector === 'all' || editingShift) ? (
              <div className="space-y-2">
                <Label htmlFor="sector_id">Setor</Label>
                <Select 
                  value={formData.sector_id} 
                  onValueChange={(v) => {
                    const sector = sectors.find(s => s.id === v);
                    setFormData({ 
                      ...formData, 
                      sector_id: v, 
                      hospital: sector?.name || formData.hospital 
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um setor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectors.map(sector => (
                      <SelectItem key={sector.id} value={sector.id}>
                        <span className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: sector.color || '#22c55e' }}
                          />
                          {sector.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // Show selected sector as a badge when viewing specific sector
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                <span 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: sectors.find(s => s.id === formData.sector_id)?.color || '#22c55e' }}
                />
                <span className="font-medium">{sectors.find(s => s.id === formData.sector_id)?.name}</span>
                <span className="text-xs text-muted-foreground">(setor selecionado)</span>
              </div>
            )}
            {/* Auto-detected shift type indicator */}
            {formData.start_time && formData.end_time && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                {isNightShift(formData.start_time, formData.end_time) ? (
                  <>
                    <Moon className="h-5 w-5 text-indigo-400" />
                    <span className="font-medium text-indigo-400">Plantão Noturno</span>
                    <span className="text-xs text-muted-foreground">(detectado automaticamente)</span>
                  </>
                ) : (
                  <>
                    <Sun className="h-5 w-5 text-amber-500" />
                    <span className="font-medium text-amber-500">Plantão Diurno</span>
                    <span className="text-xs text-muted-foreground">(detectado automaticamente)</span>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="location">Local/Sala (opcional)</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Ex: Sala 3"
              />
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shift_date">Data</Label>
                <Input
                  id="shift_date"
                  type="date"
                  value={formData.shift_date}
                  onChange={(e) => setFormData({ ...formData, shift_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_time">Início</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Quantity field for creating multiple shifts - ONLY for new shifts */}
            {!editingShift && (
              <div className="space-y-2 p-3 rounded-lg border bg-blue-50 dark:bg-blue-950/30">
                <Label htmlFor="quantity" className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-blue-600" />
                  Quantidade de Plantões (neste dia)
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  max={20}
                  value={formData.quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    const newQty = isNaN(val) || val < 1 ? 1 : Math.min(val, 20);
                    setFormData({ ...formData, quantity: newQty });
                    // Initialize multiShifts array when quantity changes
                    if (newQty > 1) {
                      setMultiShifts(prev => {
                        const newArr = [...prev];
                        while (newArr.length < newQty) {
                          newArr.push({ 
                            user_id: 'vago', 
                            start_time: formData.start_time || '07:00', 
                            end_time: formData.end_time || '19:00' 
                          });
                        }
                        return newArr.slice(0, newQty);
                      });
                    } else {
                      setMultiShifts([]);
                    }
                  }}
                  className="max-w-[120px]"
                />
                {formData.quantity > 1 && (
                  <p className="text-xs text-blue-600 font-medium">
                    Serão criados {formData.quantity} plantões - atribua cada um abaixo
                  </p>
                )}
              </div>
            )}
            
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Duração Rápida</Label>
                <Select 
                  value={formData.duration_hours} 
                  onValueChange={(v) => {
                    if (!formData.start_time) return;
                    const hours = parseInt(v, 10);
                    const [h, m] = formData.start_time.split(':').map(Number);
                    const startMinutes = h * 60 + m;
                    const endMinutes = (startMinutes + hours * 60) % (24 * 60);
                    const endH = Math.floor(endMinutes / 60).toString().padStart(2, '0');
                    const endM = (endMinutes % 60).toString().padStart(2, '0');
                    setFormData({ ...formData, end_time: `${endH}:${endM}`, duration_hours: v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 horas</SelectItem>
                    <SelectItem value="12">12 horas</SelectItem>
                    <SelectItem value="24">24 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom_duration">Duração (horas)</Label>
                <Input
                  id="custom_duration"
                  type="number"
                  min="1"
                  max="48"
                  placeholder="Ex: 8"
                  value={formData.duration_hours}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, duration_hours: value });
                    
                    if (!formData.start_time || !value) return;
                    const hours = parseInt(value, 10);
                    if (isNaN(hours) || hours < 1) return;
                    const [h, m] = formData.start_time.split(':').map(Number);
                    const startMinutes = h * 60 + m;
                    const endMinutes = (startMinutes + hours * 60) % (24 * 60);
                    const endH = Math.floor(endMinutes / 60).toString().padStart(2, '0');
                    const endM = (endMinutes % 60).toString().padStart(2, '0');
                    setFormData(prev => ({ ...prev, end_time: `${endH}:${endM}`, duration_hours: value }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">Término</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="base_value">Valor Base (R$) - opcional</Label>
                <Input
                  id="base_value"
                  type="number"
                  step="0.01"
                  value={formData.base_value}
                  onChange={(e) => setFormData({ ...formData, base_value: e.target.value })}
                  onBlur={() => {
                    if (!formData.base_value) return;
                    setFormData(prev => ({ ...prev, base_value: formatMoneyInput(prev.base_value) }));
                  }}
                  placeholder={
                    formData.use_sector_default && formData.sector_id 
                      ? (() => {
                          const sectorValue = getSectorDefaultValue(formData.sector_id, formData.start_time);
                          if (!sectorValue) return '0.00';
                          const duration = calculateDurationHours(formData.start_time, formData.end_time);
                          const proRataValue = calculateProRataValue(sectorValue, duration);
                          if (duration !== 12) {
                            return `Pro-rata ${duration.toFixed(0)}h: R$ ${(proRataValue ?? 0).toFixed(2)}`;
                          }
                          return `Padrão: R$ ${sectorValue.toFixed(2)}`;
                        })()
                      : '0.00'
                  }
                />
                {/* Checkbox for using sector default value */}
                {formData.sector_id && (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="use_sector_default"
                      checked={formData.use_sector_default}
                      onCheckedChange={(checked) => setFormData({ ...formData, use_sector_default: checked === true })}
                    />
                    <Label htmlFor="use_sector_default" className="text-xs text-muted-foreground cursor-pointer">
                      Usar valor padrão do setor se vazio
                      {formData.use_sector_default && formData.start_time && formData.end_time && (
                        <span className="ml-1 text-primary">
                          ({isNightShift(formData.start_time, '') ? 'Noturno' : 'Diurno'}: 
                          {(() => {
                            const v = getSectorDefaultValue(formData.sector_id, formData.start_time);
                            if (!v) return ' não definido';
                            const duration = calculateDurationHours(formData.start_time, formData.end_time);
                            const proRataVal = calculateProRataValue(v, duration);
                            if (duration !== 12) {
                              return ` R$ ${(proRataVal ?? 0).toFixed(2)} (${duration.toFixed(0)}h)`;
                            }
                            return ` R$ ${v.toFixed(2)}`;
                          })()})
                        </span>
                      )}
                    </Label>
                  </div>
                )}
              </div>
              
              {/* Plantonista selection - show individual selectors when quantity > 1 */}
              {!editingShift && formData.quantity > 1 ? (
                <div className="col-span-2 space-y-3 p-3 rounded-lg border bg-green-50 dark:bg-green-950/30">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-green-600" />
                    Atribuição Individual ({formData.quantity} plantões)
                  </Label>
                  <div className="grid gap-3 max-h-[300px] overflow-y-auto pr-2">
                    {Array.from({ length: formData.quantity }, (_, i) => {
                      const sectorMembers = formData.sector_id ? getMembersForSector(formData.sector_id) : [];
                      const membersToShow = sortMembersAlphabetically(sectorMembers.length > 0 ? sectorMembers : members);
                      const shiftData = multiShifts[i] || { user_id: 'vago', start_time: '07:00', end_time: '19:00' };
                      
                      return (
                        <div key={i} className="p-3 rounded-lg border bg-background space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-primary">Plantão {i + 1}</span>
                            {shiftData.start_time && shiftData.end_time && (
                              <Badge variant="outline" className="text-xs">
                                {isNightShift(shiftData.start_time, shiftData.end_time) ? '🌙 Noturno' : '☀️ Diurno'}
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Início</Label>
                              <Input
                                type="time"
                                value={shiftData.start_time}
                                onChange={(e) => {
                                  setMultiShifts(prev => {
                                    const newArr = [...prev];
                                    if (!newArr[i]) newArr[i] = { user_id: 'vago', start_time: '07:00', end_time: '19:00' };
                                    newArr[i] = { ...newArr[i], start_time: e.target.value };
                                    return newArr;
                                  });
                                }}
                                className="h-8"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Término</Label>
                              <Input
                                type="time"
                                value={shiftData.end_time}
                                onChange={(e) => {
                                  setMultiShifts(prev => {
                                    const newArr = [...prev];
                                    if (!newArr[i]) newArr[i] = { user_id: 'vago', start_time: '07:00', end_time: '19:00' };
                                    newArr[i] = { ...newArr[i], end_time: e.target.value };
                                    return newArr;
                                  });
                                }}
                                className="h-8"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Plantonista</Label>
                            <Select 
                              value={shiftData.user_id || 'vago'} 
                              onValueChange={(v) => {
                                setMultiShifts(prev => {
                                  const newArr = [...prev];
                                  if (!newArr[i]) newArr[i] = { user_id: 'vago', start_time: '07:00', end_time: '19:00' };
                                  newArr[i] = { ...newArr[i], user_id: v };
                                  return newArr;
                                });
                              }}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Selecionar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="vago">
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                                    Vago
                                  </span>
                                </SelectItem>
                                <SelectItem value="disponivel">
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500" />
                                    Disponível
                                  </span>
                                </SelectItem>
                                {membersToShow.map((m) => (
                                  <SelectItem key={m.user_id} value={m.user_id}>
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-primary" />
                                      {m.profile?.name || 'Sem nome'}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Atribuição do Plantão</Label>
                  <Select 
                    value={formData.assigned_user_id || 'vago'} 
                    onValueChange={(v) => setFormData({ ...formData, assigned_user_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vago">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gray-400" />
                          Plantão Vago
                        </span>
                      </SelectItem>
                      <SelectItem value="disponivel">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Plantão Disponível
                        </span>
                      </SelectItem>
                      {(() => {
                        const sectorMembers = formData.sector_id ? getMembersForSector(formData.sector_id) : [];
                        const membersToShow = sortMembersAlphabetically(sectorMembers.length > 0 ? sectorMembers : members);
                        const label = sectorMembers.length > 0 ? 'Plantonistas do Setor' : 'Todos os Plantonistas';
                        
                        if (membersToShow.length > 0) {
                          return (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                                {label}
                              </div>
                              {membersToShow.map((m) => (
                                <SelectItem key={m.user_id} value={m.user_id}>
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-primary" />
                                    {m.profile?.name || 'Sem nome'}
                                  </span>
                                </SelectItem>
                              ))}
                            </>
                          );
                        }
                        return (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
                            Nenhum plantonista cadastrado
                          </div>
                        );
                      })()}
                    </SelectContent>
                  </Select>
                  {formData.assigned_user_id === 'disponivel' && (
                    <p className="text-xs text-muted-foreground">
                      Este plantão ficará visível para plantonistas se oferecerem.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observações adicionais..."
              />
            </div>

            {/* Repeat in next weeks */}
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" />
                <Label className="font-medium">
                  {editingShift ? 'Duplicar nas próximas semanas' : 'Repetir nas próximas semanas'}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {editingShift 
                  ? 'Crie cópias deste plantão nas próximas semanas com os mesmos dados.'
                  : 'Crie plantões idênticos nas mesmas datas e horários nas próximas semanas.'}
              </p>
              <Select 
                value={formData.repeat_weeks.toString()} 
                onValueChange={(v) => setFormData({ ...formData, repeat_weeks: parseInt(v, 10) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Não repetir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Não {editingShift ? 'duplicar' : 'repetir'}</SelectItem>
                  <SelectItem value="1">{editingShift ? 'Duplicar' : 'Repetir'} por 1 semana</SelectItem>
                  <SelectItem value="2">{editingShift ? 'Duplicar' : 'Repetir'} por 2 semanas</SelectItem>
                  <SelectItem value="3">{editingShift ? 'Duplicar' : 'Repetir'} por 3 semanas</SelectItem>
                  <SelectItem value="4">{editingShift ? 'Duplicar' : 'Repetir'} por 4 semanas</SelectItem>
                  <SelectItem value="5">{editingShift ? 'Duplicar' : 'Repetir'} por 5 semanas</SelectItem>
                  <SelectItem value="6">{editingShift ? 'Duplicar' : 'Repetir'} por 6 semanas</SelectItem>
                  <SelectItem value="7">{editingShift ? 'Duplicar' : 'Repetir'} por 7 semanas</SelectItem>
                  <SelectItem value="8">{editingShift ? 'Duplicar' : 'Repetir'} por 8 semanas</SelectItem>
                </SelectContent>
              </Select>
              {formData.repeat_weeks > 0 && (
                <p className="text-xs text-primary font-medium">
                  {editingShift 
                    ? `Serão criadas ${formData.repeat_weeks} cópias deste plantão nas próximas semanas`
                    : `Serão criados ${1 + formData.repeat_weeks} plantões no total (este + ${formData.repeat_weeks} semanas)`}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full">
              {editingShift 
                ? (formData.repeat_weeks > 0 
                    ? `Salvar e Duplicar ${formData.repeat_weeks}x` 
                    : 'Salvar Alterações')
                : (() => {
                    const qty = formData.quantity || 1;
                    const weeks = formData.repeat_weeks || 0;
                    const total = qty * (1 + weeks);
                    if (total > 1) {
                      return `Criar ${total} Plantões`;
                    }
                    return 'Criar Plantão';
                  })()}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign User Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Plantonista</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4">
            <div className="space-y-2">
              <Label>Plantonista</Label>
              <Select value={assignData.user_id} onValueChange={(v) => setAssignData({ ...assignData, user_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plantonista" />
                </SelectTrigger>
                <SelectContent>
                  {sortMembersAlphabetically(members).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.name || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_value">Valor Atribuído (R$)</Label>
              <Input
                id="assigned_value"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={assignData.assigned_value}
                onChange={(e) => setAssignData({ ...assignData, assigned_value: e.target.value })}
                onBlur={() =>
                  setAssignData((prev) => ({
                    ...prev,
                    assigned_value: prev.assigned_value ? formatMoneyInput(prev.assigned_value) : '',
                  }))
                }
              />
            </div>
            <Button type="submit" className="w-full" disabled={!assignData.user_id}>
              Atribuir Plantonista
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Conflict Details Dialog */}
      <Dialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Conflitos de Escala ({conflicts.length})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Os conflitos abaixo indicam plantonistas escalados em mais de um local no mesmo horário.
              Você pode remover uma das atribuições ou reconhecer o conflito se for intencional.
            </p>

            {conflicts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                ✅ Nenhum conflito detectado
              </div>
            ) : (
              conflicts.map(conflict => {
                const isAcknowledged = acknowledgedConflicts.has(conflict.id);
                
                return (
                  <Card 
                    key={conflict.id} 
                    className={`border-2 ${isAcknowledged ? 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20' : 'border-red-400 bg-red-50/50 dark:bg-red-950/20'}`}
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-red-600" />
                          <span className="font-bold text-lg">{conflict.userName}</span>
                          {isAcknowledged && (
                            <Badge className="bg-yellow-500 text-white">Reconhecido</Badge>
                          )}
                        </div>
                        <Badge variant="outline">
                          {format(parseISO(conflict.date), "EEEE, dd/MM/yyyy", { locale: ptBR })}
                        </Badge>
                      </div>

                      {/* Conflicting shifts */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">
                          Escalado em {conflict.shifts.length} locais simultaneamente:
                        </p>
                        {conflict.shifts.map((shiftInfo, idx) => (
                          <div 
                            key={idx}
                            className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white dark:bg-background rounded border"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col">
                                <span className="font-medium">{shiftInfo.sectorName}</span>
                                <span className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {shiftInfo.startTime.slice(0, 5)} - {shiftInfo.endTime.slice(0, 5)}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => prepareRemoveConflictAssignment(conflict, shiftInfo)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remover
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      {!isAcknowledged && (
                        <div className="flex justify-end pt-2 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAcknowledgeConflict(conflict)}
                            className="border-yellow-500 text-yellow-700 hover:bg-yellow-100"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Reconhecer e Manter
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={openConflictHistory}>
              <History className="h-4 w-4 mr-1" />
              Histórico
            </Button>
            <Button onClick={() => setConflictDialogOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Justification Dialog for Acknowledging Conflict */}
      <Dialog open={justificationDialogOpen} onOpenChange={setJustificationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-600">
              <FileText className="h-5 w-5" />
              Justificar Conflito
            </DialogTitle>
          </DialogHeader>
          
          {pendingAcknowledgeConflict && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200">
                <p className="font-medium">{pendingAcknowledgeConflict.userName}</p>
                <p className="text-sm text-muted-foreground">
                  {format(parseISO(pendingAcknowledgeConflict.date), "dd/MM/yyyy", { locale: ptBR })}
                </p>
                <div className="mt-2 space-y-1">
                  {pendingAcknowledgeConflict.shifts.map((s, i) => (
                    <p key={i} className="text-sm">
                      • {s.sectorName} ({s.startTime.slice(0,5)} - {s.endTime.slice(0,5)})
                    </p>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="justification">Justificativa *</Label>
                <Textarea
                  id="justification"
                  placeholder="Informe o motivo pelo qual este conflito é intencional..."
                  value={justificationText}
                  onChange={(e) => setJustificationText(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setJustificationDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={confirmAcknowledgeConflict}
                  disabled={!justificationText.trim()}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Confirmar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeConfirmDialogOpen} onOpenChange={setRemoveConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Confirmar Remoção
            </DialogTitle>
          </DialogHeader>
          
          {pendingRemoval && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Confirme a remoção do plantonista <strong>{pendingRemoval.conflict.userName}</strong> do local abaixo:
              </p>
              
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Será REMOVIDO de:</p>
                  <p className="font-medium">{pendingRemoval.assignmentToRemove.sectorName}</p>
                  <p className="text-sm text-muted-foreground">
                    {pendingRemoval.assignmentToRemove.startTime.slice(0,5)} - {pendingRemoval.assignmentToRemove.endTime.slice(0,5)}
                  </p>
                </div>
                
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Permanecerá em:</p>
                  <p className="font-medium">{pendingRemoval.assignmentToKeep.sectorName}</p>
                  <p className="text-sm text-muted-foreground">
                    {pendingRemoval.assignmentToKeep.startTime.slice(0,5)} - {pendingRemoval.assignmentToKeep.endTime.slice(0,5)}
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRemoveConfirmDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={confirmRemoveConflictAssignment}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Confirmar Remoção
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Conflict History Dialog */}
      <Dialog open={conflictHistoryDialogOpen} onOpenChange={setConflictHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Resoluções de Conflitos
            </DialogTitle>
          </DialogHeader>
          
          {loadingHistory ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando histórico...
            </div>
          ) : conflictHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma resolução de conflito registrada.
            </div>
          ) : (
            <div className="space-y-3">
              {conflictHistory.map((resolution) => (
                <Card key={resolution.id} className={`border ${resolution.resolution_type === 'acknowledged' ? 'border-yellow-300' : 'border-blue-300'}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-medium">{resolution.plantonista_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(resolution.conflict_date), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <Badge variant={resolution.resolution_type === 'acknowledged' ? 'secondary' : 'outline'}>
                        {resolution.resolution_type === 'acknowledged' ? '✅ Conflito Mantido' : '🔄 Remoção'}
                      </Badge>
                    </div>
                    
                    {resolution.resolution_type === 'acknowledged' ? (
                      <div className="mt-2 p-2 rounded bg-yellow-50 dark:bg-yellow-950/20">
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Justificativa:</p>
                        <p className="text-sm">{resolution.justification}</p>
                      </div>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-red-50 dark:bg-red-950/20">
                          <p className="text-xs font-medium text-red-600 dark:text-red-400">❌ Removido de:</p>
                          <p className="text-sm font-medium">{getResolutionLocation(resolution, 'removed').sectorName}</p>
                          <p className="text-xs text-muted-foreground">{getResolutionLocation(resolution, 'removed').shiftTime}</p>
                        </div>
                        <div className="p-2 rounded bg-green-50 dark:bg-green-950/20">
                          <p className="text-xs font-medium text-green-600 dark:text-green-400">✅ Mantido em:</p>
                          <p className="text-sm font-medium">{getResolutionLocation(resolution, 'kept').sectorName}</p>
                          <p className="text-xs text-muted-foreground">{getResolutionLocation(resolution, 'kept').shiftTime}</p>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground mt-2">
                      Resolvido por {resolution.resolved_by_profile?.name || 'Admin'} em {format(parseISO(resolution.resolved_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={() => setConflictHistoryDialogOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Create Dialog */}
      <Dialog open={bulkCreateDialogOpen} onOpenChange={setBulkCreateDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Criar Plantões em Lote
            </DialogTitle>
          </DialogHeader>
          
          <div className="mb-4 p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm font-medium">Datas selecionadas: {selectedDates.size}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {Array.from(selectedDates).sort().slice(0, 10).map(dateStr => (
                <Badge key={dateStr} variant="secondary" className="text-xs">
                  {format(parseISO(dateStr), "dd/MM", { locale: ptBR })}
                </Badge>
              ))}
              {selectedDates.size > 10 && (
                <Badge variant="outline" className="text-xs">
                  +{selectedDates.size - 10} mais
                </Badge>
              )}
            </div>
          </div>

          <form onSubmit={handleBulkCreate} className="space-y-4">
            {/* Sector selector */}
            <div className="space-y-2">
              <Label htmlFor="bulk_sector_id">Setor</Label>
              <Select 
                value={formData.sector_id} 
                onValueChange={(v) => {
                  const sector = sectors.find(s => s.id === v);
                  setFormData({ 
                    ...formData, 
                    sector_id: v, 
                    hospital: sector?.name || formData.hospital 
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um setor" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map(sector => (
                    <SelectItem key={sector.id} value={sector.id}>
                      <span className="flex items-center gap-2">
                        <span 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: sector.color || '#22c55e' }}
                        />
                        {sector.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auto-detected shift type indicator */}
            {formData.start_time && formData.end_time && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                {isNightShift(formData.start_time, formData.end_time) ? (
                  <>
                    <Moon className="h-5 w-5 text-indigo-400" />
                    <span className="font-medium text-indigo-400">Plantão Noturno</span>
                  </>
                ) : (
                  <>
                    <Sun className="h-5 w-5 text-amber-500" />
                    <span className="font-medium text-amber-500">Plantão Diurno</span>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="bulk_location">Local/Sala (opcional)</Label>
              <Input
                id="bulk_location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Ex: Sala 3"
              />
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bulk_start_time">Início</Label>
                <Input
                  id="bulk_start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk_end_time">Término</Label>
                <Input
                  id="bulk_end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bulk_base_value">Valor Base (R$)</Label>
                <Input
                  id="bulk_base_value"
                  type="number"
                  step="0.01"
                  value={formData.base_value}
                  onChange={(e) => setFormData({ ...formData, base_value: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Atribuição</Label>
                <Select 
                  value={formData.assigned_user_id || 'vago'} 
                  onValueChange={(v) => setFormData({ ...formData, assigned_user_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vago">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400" />
                        Plantão Vago
                      </span>
                    </SelectItem>
                    <SelectItem value="disponivel">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Plantão Disponível
                      </span>
                    </SelectItem>
                    {(() => {
                      const sectorMembers = formData.sector_id ? getMembersForSector(formData.sector_id) : [];
                      const membersToShow = sortMembersAlphabetically(sectorMembers.length > 0 ? sectorMembers : members);
                      const label = sectorMembers.length > 0 ? 'Plantonistas do Setor' : 'Todos os Plantonistas';
                      
                      if (membersToShow.length > 0) {
                        return (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                              {label}
                            </div>
                            {membersToShow.map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id}>
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-primary" />
                                  {m.profile?.name || 'Sem nome'}
                                </span>
                              </SelectItem>
                            ))}
                          </>
                        );
                      }
                      return null;
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk_notes">Observações</Label>
              <Input
                id="bulk_notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observações adicionais..."
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setBulkCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={selectedDates.size === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Criar {selectedDates.size} Plantão(ões)
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Copy Schedule Dialog */}
      <Dialog open={copyScheduleDialogOpen} onOpenChange={setCopyScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Copiar Escala para Outro Mês
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="text-sm text-muted-foreground mb-2">Escala atual:</div>
              <div className="font-semibold text-lg flex items-center gap-2">
                {(() => {
                  const sector = sectors.find(s => s.id === filterSector);
                  return sector ? (
                    <>
                      <span 
                        className="w-4 h-4 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: sector.color || '#22c55e' }}
                      />
                      {sector.name}
                    </>
                  ) : 'Setor não encontrado';
                })()}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {format(currentDate, 'MMMM yyyy', { locale: ptBR })} - {shifts.filter(s => s.sector_id === filterSector).length} plantões
              </div>
            </div>

            <div className="space-y-2">
              <Label>Copiar para o mês:</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyTargetMonth && setCopyTargetMonth(subMonths(copyTargetMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center font-semibold text-lg py-2 px-4 border rounded-lg bg-background">
                  {copyTargetMonth && format(copyTargetMonth, 'MMMM yyyy', { locale: ptBR })}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyTargetMonth && setCopyTargetMonth(addMonths(copyTargetMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
              <strong>Atenção:</strong> Os plantões serão copiados para o mesmo <strong>dia da semana</strong> e a mesma <strong>ocorrência no mês</strong>
              (ex: 2ª segunda-feira → 2ª segunda-feira). Se não existir essa ocorrência no mês destino, será ignorado.
              As atribuições de plantonistas também serão copiadas.
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => {
                  setCopyScheduleDialogOpen(false);
                  setCopyTargetMonth(null);
                }}
                disabled={copyInProgress}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1" 
                onClick={handleCopySchedule}
                disabled={copyInProgress || !copyTargetMonth}
              >
                {copyInProgress ? (
                  <>Copiando...</>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar Escala
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Selected Shifts (Apply same changes) */}
      <Dialog
        open={bulkApplyDialogOpen}
        onOpenChange={(open) => {
          setBulkApplyDialogOpen(open);
          if (!open) {
            setBulkApplyShiftIds([]);
            setBulkApplyData({ title: '', start_time: '', end_time: '', base_value: '', assigned_user_id: '' });
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edição em bloco ({bulkApplyShiftIds.length})
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleBulkApplySave} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do plantão (opcional)</Label>
              <Input
                value={bulkApplyData.title}
                onChange={(e) => setBulkApplyData((p) => ({ ...p, title: e.target.value }))}
                placeholder="Ex: Plantão Diurno"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Início (opcional)</Label>
                <Input
                  type="time"
                  value={bulkApplyData.start_time}
                  onChange={(e) => setBulkApplyData((p) => ({ ...p, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Término (opcional)</Label>
                <Input
                  type="time"
                  value={bulkApplyData.end_time}
                  onChange={(e) => setBulkApplyData((p) => ({ ...p, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Valor (R$) (opcional)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={bulkApplyData.base_value}
                onChange={(e) => setBulkApplyData((p) => ({ ...p, base_value: e.target.value }))}
                onBlur={() => {
                  if (!bulkApplyData.base_value) return;
                  setBulkApplyData((p) => ({ ...p, base_value: formatMoneyInput(p.base_value) }));
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Plantonista (opcional)</Label>
              <Select
                value={bulkApplyData.assigned_user_id || '__keep__'}
                onValueChange={(v) => setBulkApplyData((p) => ({ ...p, assigned_user_id: v === '__keep__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Manter como está" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keep__">Manter como está</SelectItem>
                  <SelectItem value="__clear__">Remover plantonista (vago)</SelectItem>
                  {sortMembersAlphabetically(members).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.name || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setBulkApplyDialogOpen(false);
                  setBulkApplyShiftIds([]);
                  setBulkApplyData({ title: '', start_time: '', end_time: '', base_value: '', assigned_user_id: '' });
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                Aplicar ({bulkApplyShiftIds.length})
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit All Shifts of Day Dialog */}
      <Dialog open={bulkEditDialogOpen} onOpenChange={(open) => {
        if (open && bulkEditDialogCloseGuardRef.current) {
          setBulkEditDialogOpen(false);
          return;
        }

        setBulkEditDialogOpen(open);
        if (!open) {
          setBulkEditData([]);
          setBulkEditShifts([]);
        }
      }}>
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={(e) => {
            // Prevent focus from returning to the trigger button, which can cause an immediate re-open
            // when the user released Enter after submitting the form.
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Editar Todos os Plantões do Dia ({bulkEditShifts.length})
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleBulkEditSave} className="space-y-4">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {bulkEditData.map((editData, index) => {
                const originalShift = bulkEditShifts.find(s => s.id === editData.id);
                const sectorMembers = editData.sector_id ? getMembersForSector(editData.sector_id) : [];
                const membersToShow = sortMembersAlphabetically(sectorMembers.length > 0 ? sectorMembers : members);
                const sectorColor = getSectorColor(editData.sector_id, editData.hospital);
                const isNight = isNightShift(editData.start_time, editData.end_time);

                return (
                  <Card 
                    key={editData.id} 
                    className="border-2"
                    style={{ borderColor: sectorColor }}
                  >
                    <CardHeader className="py-3" style={{ backgroundColor: `${sectorColor}10` }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">Plantão {index + 1}</span>
                          <Badge variant="outline" style={{ borderColor: sectorColor, color: sectorColor }}>
                            {getSectorName(editData.sector_id, editData.hospital)}
                          </Badge>
                          {isNight ? (
                            <Badge className="bg-indigo-100 text-indigo-700">🌙 Noturno</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700">☀️ Diurno</Badge>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {editData.start_time} - {editData.end_time}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Sector */}
                        <div className="space-y-2">
                          <Label>Setor</Label>
                          <Select
                            value={editData.sector_id || '__none__'}
                            onValueChange={(v) => {
                              if (v === '__none__') {
                                setBulkEditData((prev) =>
                                  prev.map((d, i) => (i === index ? { ...d, sector_id: '' } : d))
                                );
                                return;
                              }

                              const sector = sectors.find((s) => s.id === v);
                              setBulkEditData((prev) =>
                                prev.map((d, i) =>
                                  i === index
                                    ? { ...d, sector_id: v, hospital: sector?.name || d.hospital }
                                    : d
                                )
                              );
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Sem setor</SelectItem>
                              {sectors.map((sector) => (
                                <SelectItem key={sector.id} value={sector.id}>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: sector.color || '#22c55e' }}
                                    />
                                    {sector.name}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Location */}
                        <div className="space-y-2">
                          <Label>Local/Sala</Label>
                          <Input
                            value={editData.location}
                            onChange={(e) => setBulkEditData(prev => prev.map((d, i) => 
                              i === index ? { ...d, location: e.target.value } : d
                            ))}
                            placeholder="Ex: Sala 3"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Start Time */}
                        <div className="space-y-2">
                          <Label>Início</Label>
                          <Input
                            type="time"
                            value={editData.start_time}
                            onChange={(e) => setBulkEditData(prev => prev.map((d, i) => 
                              i === index ? { ...d, start_time: e.target.value } : d
                            ))}
                          />
                        </div>

                        {/* End Time */}
                        <div className="space-y-2">
                          <Label>Término</Label>
                          <Input
                            type="time"
                            value={editData.end_time}
                            onChange={(e) => setBulkEditData(prev => prev.map((d, i) => 
                              i === index ? { ...d, end_time: e.target.value } : d
                            ))}
                          />
                        </div>

                        {/* Base Value */}
                        <div className="space-y-2">
                          <Label>Valor (R$)</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0,00"
                            value={editData.base_value}
                            onChange={(e) =>
                              setBulkEditData((prev) =>
                                prev.map((d, i) => (i === index ? { ...d, base_value: e.target.value } : d))
                              )
                            }
                            onBlur={() => {
                              if (!editData.base_value) return;
                              setBulkEditData((prev) =>
                                prev.map((d, i) => (i === index ? { ...d, base_value: formatMoneyInput(d.base_value) } : d))
                              );
                            }}
                          />
                        </div>

                        {/* Assigned User */}
                        <div className="space-y-2">
                          <Label>Plantonista</Label>
                          <Select 
                            value={editData.assigned_user_id || 'vago'} 
                            onValueChange={(v) => setBulkEditData(prev => prev.map((d, i) => 
                              i === index ? { ...d, assigned_user_id: v } : d
                            ))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="vago">
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                                  Vago
                                </span>
                              </SelectItem>
                              <SelectItem value="disponivel">
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-green-500" />
                                  Disponível
                                </span>
                              </SelectItem>
                              {membersToShow.map((m) => (
                                <SelectItem key={m.user_id} value={m.user_id}>
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-primary" />
                                    {m.profile?.name || 'Sem nome'}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="space-y-2">
                        <Label>Observações</Label>
                        <Input
                          value={editData.notes}
                          onChange={(e) => setBulkEditData(prev => prev.map((d, i) => 
                            i === index ? { ...d, notes: e.target.value } : d
                          ))}
                          placeholder="Observações adicionais..."
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1"
                onClick={closeBulkEditDialog}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                Salvar Todos ({bulkEditData.length} plantões)
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
