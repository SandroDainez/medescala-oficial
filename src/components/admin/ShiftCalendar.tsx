import react, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { adminFeedback } from '@/lib/adminFeedback';
import { buildBulkEditAddedMovement, buildBulkEditRemovedMovement, buildBulkEditShiftPayload, buildBulkEditStatusNotes, buildBulkShiftUpdatePayload, collectBulkApplyTargetShifts, createBulkEditDrafts, findInvalidBulkAssigneeShift, getBulkApplyEffectiveTimes, getBulkEditAssignmentMode, hasBulkApplyChanges, normalizeBulkEditAssignmentChoice } from '@/lib/adminBulkEdit';
import { ChevronLeft, ChevronRight, Plus, UserPlus, Trash2, Edit, Users, Clock, MapPin, Calendar, LayoutGrid, Moon, Sun, Printer, Repeat, Check, X, AlertTriangle, Copy, History, FileText, RefreshCw, ArrowRightLeft, Download, Upload, DollarSign, UserCog } from 'lucide-react';
import ScheduleMovements from './ScheduleMovements';
import SectorValuesDialog from '@/components/admin/SectorValuesDialog';
import UserSectorValuesDialog from '@/components/admin/UserSectorValuesDialog';
import { recordScheduleMovement } from '@/lib/scheduleMovements';
import { createAdminConflictResolution, deleteAdminConflictHistoryByIds, deleteAllAdminConflictHistory, fetchAdminConflictHistory, resolveAdminProfileId } from '@/services/adminConflicts';
import { acceptAdminShiftOffer, rejectAdminShiftOffer } from '@/services/adminOffers';
import { fetchAdminScheduleData } from '@/services/adminScheduleData';
import { cloneAdminAssignmentToShift, deleteAdminAssignment, deleteAdminAssignmentsByShiftIds, fetchAdminAssignmentRange, fetchAdminAssignmentsByShiftIds, transferAdminAssignment, updateAdminAssignmentValue, upsertAdminAssignment } from '@/services/adminAssignments';
import { confirmAdminShiftExists, deleteAdminShiftById, deleteAdminShiftsByIds, fetchAdminShiftsInRange, insertAdminShiftAndGetId, updateAdminShiftById, updateAdminShiftsByIds } from '@/services/adminShifts';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, getDate, getDaysInMonth, setDate, addDays, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';

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
  profile: { name: string | null; full_name?: string | null } | null;
}

interface ShiftOffer {
  id: string;
  shift_id: string;
  user_id: string;
  status: string;
  message: string | null;
  profile: { name: string | null; full_name?: string | null } | null;
}

interface Member {
  user_id: string;
  profile: { id: string; name: string | null; full_name?: string | null; profile_type?: string | null } | null;
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

interface ImportedShiftRow {
  sector_id: string;
  sector_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  hospital: string;
  location: string | null;
  base_value: number | null;
  notes: string | null;
  title: string;
  assignee_names?: string[];
}

const SQUARE_SELECT_TRIGGER_CLASS =
  "h-auto min-h-10 rounded-lg border border-border/70 bg-card px-3 py-2 shadow-sm [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words";

const SQUARE_SELECT_CONTENT_CLASS =
  "max-h-[280px] overflow-y-auto rounded-lg border border-border/70 bg-card p-1";

const SQUARE_SELECT_ITEM_CLASS =
  "my-1 rounded-lg border border-border/60 px-2 py-2 text-sm data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary/10";

export default function ShiftCalendar({ initialSectorId }: ShiftCalendarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const notifySuccess = useCallback(
    (action: string, description?: string) => adminFeedback.success(toast, action, description),
    [toast],
  );
  const notifyInfo = useCallback(
    (title: string, description?: string) => adminFeedback.info(toast, title, description),
    [toast],
  );
  const notifyWarning = useCallback(
    (title: string, description?: string) => adminFeedback.warning(toast, title, description),
    [toast],
  );
  const notifyError = useCallback(
    (action: string, error?: unknown, fallback?: string) => adminFeedback.error(toast, action, error, fallback),
    [toast],
  );
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
  const [daySelectedShiftIds, setDaySelectedShiftIds] = useState<Set<string>>(new Set());

  // When viewing a specific sector card while filter is "all",
  // keep the day dialog scoped to that sector.
  const [dayDialogSectorId, setDayDialogSectorId] = useState<string | null>(null);
  const [dayDialogFocusedShiftId, setDayDialogFocusedShiftId] = useState<string | null>(null);
  
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(new Set());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  
  // Dialogs
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [valuesDialogOpen, setValuesDialogOpen] = useState(false);
  const [userValuesDialogOpen, setUserValuesDialogOpen] = useState(false);
  const [selectedSectorForValues, setSelectedSectorForValues] = useState<Sector | null>(null);
  const [selectedSectorForUserValues, setSelectedSectorForUserValues] = useState<Sector | null>(null);
  const [focusBaseValueOnEdit, setFocusBaseValueOnEdit] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  // Prevent immediate re-open after a programmatic close (e.g. focus/trigger quirks)
  const shiftDialogCloseGuardRef = useRef(false);
  const bulkEditDialogCloseGuardRef = useRef(false);
  const dayDialogCloseGuardRef = useRef(false);
  const fetchRequestIdRef = useRef(0);

  // Extra hard guard: temporarily disable the trigger button to avoid click-through (mouse up)
  // after closing/saving the bulk edit dialog.
  const [bulkEditTriggerDisabled, setBulkEditTriggerDisabled] = useState(false);

  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [acknowledgedConflicts, setAcknowledgedConflicts] = useState<Set<string>>(new Set());
  const [bulkCreateDialogOpen, setBulkCreateDialogOpen] = useState(false);
  const [copyScheduleDialogOpen, setCopyScheduleDialogOpen] = useState(false);
  const [copyTargetMonth, setCopyTargetMonth] = useState<Date | null>(null);
  const [copyInProgress, setCopyInProgress] = useState(false);
  const [replicateDayDialogOpen, setReplicateDayDialogOpen] = useState(false);
  const [replicateWeeks, setReplicateWeeks] = useState(1);
  const [replicateLoading, setReplicateLoading] = useState(false);
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);
  const [deleteDaysDialogOpen, setDeleteDaysDialogOpen] = useState(false);
  const [deleteDaysStart, setDeleteDaysStart] = useState<Date | null>(null);
  const [deleteDaysEnd, setDeleteDaysEnd] = useState<Date | null>(null);
  const [deleteDaysConfirmText, setDeleteDaysConfirmText] = useState('');
  const [deletingDaysRange, setDeletingDaysRange] = useState(false);
  const [replicateCustomDayDialogOpen, setReplicateCustomDayDialogOpen] = useState(false);
  const [replicateCustomDayTargetDate, setReplicateCustomDayTargetDate] = useState<Date | null>(null);
  const [replicateCustomDayLoading, setReplicateCustomDayLoading] = useState(false);
  const [replicateWeekDialogOpen, setReplicateWeekDialogOpen] = useState(false);
  const [replicateWeekSourceStart, setReplicateWeekSourceStart] = useState<Date | null>(null);
  const [replicateWeekTargetStart, setReplicateWeekTargetStart] = useState<Date | null>(null);
  const [replicateWeekLoading, setReplicateWeekLoading] = useState(false);
  const [bulkEditSaving, setBulkEditSaving] = useState(false);
  const [bulkEditShifts, setBulkEditShifts] = useState<Shift[]>([]);
  const [deletingDayShifts, setDeletingDayShifts] = useState(false);
  const [deletingCurrentScale, setDeletingCurrentScale] = useState(false);
  const [deleteScaleDialogOpen, setDeleteScaleDialogOpen] = useState(false);
  const [deleteScaleConfirmText, setDeleteScaleConfirmText] = useState('');
  const [deleteScaleContext, setDeleteScaleContext] = useState<{
    sectorName: string;
    periodLabel: string;
    count: number;
    ids: string[];
  } | null>(null);
  
  // Conflict resolution states
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);
  const [pendingAcknowledgeConflict, setPendingAcknowledgeConflict] = useState<ShiftConflict | null>(null);
  const [justificationText, setJustificationText] = useState('');
  const [conflictHistoryDialogOpen, setConflictHistoryDialogOpen] = useState(false);
  const [conflictHistory, setConflictHistory] = useState<any[]>([]);
  const [selectedConflictHistoryIds, setSelectedConflictHistoryIds] = useState<Set<string>>(new Set());
  const [deletingConflictHistory, setDeletingConflictHistory] = useState(false);
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

  function getAcknowledgedResolutionLocations(
    resolution: any
  ): Array<{ sectorName: string; shiftTime: string; assignmentKey: string }> {
    const details = safeParseConflictDetails(resolution?.conflict_details);
    const seen = new Set<string>();
    const rows: Array<{ sectorName: string; shiftTime: string; assignmentKey: string }> = [];

    for (const item of details) {
      const assignmentId = getNonEmptyString(item?.assignmentId, item?.assignment_id) || '';
      const sectorName = getNonEmptyString(
        item?.sectorName,
        item?.sector_name,
        item?.sector,
        item?.hospital,
        item?.location
      ) || 'Não informado';
      const start = getNonEmptyString(item?.startTime, item?.start_time);
      const end = getNonEmptyString(item?.endTime, item?.end_time);
      const shiftTime = start && end ? `${start.slice(0, 5)} - ${end.slice(0, 5)}` : '—';
      const dedupeKey = assignmentId || `${sectorName}|${shiftTime}`;

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      rows.push({
        sectorName,
        shiftTime,
        assignmentKey: dedupeKey,
      });
    }

    return rows;
  }

  function getResolvedByName(resolution: any): string {
    return (
      resolution?.resolved_by_profile?.full_name ||
      resolution?.resolved_by_profile?.name ||
      resolution?.resolved_by_name ||
      'Admin'
    );
  }

  function getResolutionActionSummary(resolution: any): string {
    if (resolution?.action_taken && String(resolution.action_taken).trim()) {
      return String(resolution.action_taken).trim();
    }

    if (resolution?.resolution_type === 'removed') {
      const removed = getResolutionLocation(resolution, 'removed');
      const kept = getResolutionLocation(resolution, 'kept');
      return `Tirado de ${removed.sectorName} (${removed.shiftTime}) e mantido em ${kept.sectorName} (${kept.shiftTime}).`;
    }

    if (resolution?.resolution_type === 'acknowledged') {
      const count = getAcknowledgedResolutionLocations(resolution).length;
      return count > 0
        ? `Conflito reconhecido e mantido (${count} atribuição(ões)).`
        : 'Conflito reconhecido e mantido.';
    }

    return 'Ação não informada.';
  }

  function renderConflictHistoryCard(resolution: any) {
    return (
      <Card key={resolution.id} className={`border ${resolution.resolution_type === 'acknowledged' ? 'border-yellow-300' : 'border-blue-300'}`}>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id={`resolution-${resolution.id}`}
                checked={selectedConflictHistoryIds.has(resolution.id)}
                onCheckedChange={(checked) => toggleConflictHistorySelection(resolution.id, Boolean(checked))}
                disabled={deletingConflictHistory}
              />
              <div>
                <p className="font-medium">{resolution.plantonista_name}</p>
                <p className="text-sm text-muted-foreground">
                  {format(parseISO(resolution.conflict_date), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
            <Badge variant={resolution.resolution_type === 'acknowledged' ? 'secondary' : 'outline'}>
              {resolution.resolution_type === 'acknowledged' ? '✅ Conflito Mantido' : '🔄 Remoção'}
            </Badge>
          </div>

          <div className="mb-2 rounded-md border border-border/60 bg-muted/30 p-2">
            <p className="text-xs font-medium text-muted-foreground">Ação tomada</p>
            <p className="text-sm font-medium">{getResolutionActionSummary(resolution)}</p>
          </div>
          
          {resolution.resolution_type === 'acknowledged' ? (
            <div className="mt-2 space-y-2">
              {getAcknowledgedResolutionLocations(resolution).length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {getAcknowledgedResolutionLocations(resolution).map((location) => (
                    <div key={location.assignmentKey} className="p-2 rounded bg-green-50 dark:bg-green-950/20">
                      <p className="text-xs font-medium text-green-600 dark:text-green-400">✅ Mantido em:</p>
                      <p className="text-sm font-medium">{location.sectorName}</p>
                      <p className="text-xs text-muted-foreground">{location.shiftTime}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-2 rounded bg-yellow-50 dark:bg-yellow-950/20">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Justificativa:</p>
                <p className="text-sm whitespace-pre-wrap break-words">{resolution.justification}</p>
              </div>
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
            Resolvido por {getResolvedByName(resolution)} em {format(parseISO(resolution.resolved_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
        </CardContent>
      </Card>
    );
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
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importingShifts, setImportingShifts] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreviewRows, setImportPreviewRows] = useState<ImportedShiftRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  
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
    day_quantity: 1,
    night_quantity: 0,
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
  const [transferAssignment, setTransferAssignment] = useState<ShiftAssignment | null>(null);
  const [transferSourceShift, setTransferSourceShift] = useState<Shift | null>(null);
  const [transferTargetSectorId, setTransferTargetSectorId] = useState('');
  const [transferTargetShiftId, setTransferTargetShiftId] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Update filter when initialSectorId changes (from URL)
  useEffect(() => {
    // When route has no sectorId (e.g. /admin/calendar), always show all sectors.
    // When route has a sectorId (e.g. /admin/calendar/:sectorId), show only that sector.
    setFilterSector(initialSectorId || 'all');
  }, [initialSectorId]);

  const fetchData = useCallback(async () => {
    if (!currentTenantId || !user?.id) return;
    const requestId = ++fetchRequestIdRef.current;
    const isStale = () => requestId !== fetchRequestIdRef.current;
    setLoading(true);

    try {
      const result = await fetchAdminScheduleData({
        tenantId: currentTenantId,
        userId: user.id,
        currentDate,
        viewMode,
        filterSector,
      });
      if (isStale()) return;

      setSectors(result.sectors as Sector[]);
      setSectorMemberships(result.sectorMemberships);
      setMembers(result.members as Member[]);
      setUserSectorValues(result.userSectorValues);
      setShifts(result.shifts as Shift[]);
      setAssignments(result.assignments as unknown as ShiftAssignment[]);
      setShiftOffers(result.offers as unknown as ShiftOffer[]);
      setAcknowledgedConflicts(result.acknowledgedConflictKeys);
    } catch (error: any) {
      console.error('[ShiftCalendar] fetchData error', error);
      notifyError('carregar calendário', error, 'Erro desconhecido');
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [currentTenantId, user?.id, currentDate, viewMode, filterSector, notifyError]);

  useEffect(() => {
    // IMPORTANT: wait for authenticated user before calling RPCs that depend on auth.uid().
    // If we fetch too early, the backend returns empty rows and names "disappear" until a manual refresh.
    if (currentTenantId && user?.id) {
      fetchData();
    }
  }, [currentTenantId, user?.id, currentDate, viewMode, fetchData]);

  // Get members that belong to a specific sector
  function getMembersForSector(sectorId: string): Member[] {
    const sectorUserIds = sectorMemberships
      .filter(sm => sm.sector_id === sectorId)
      .map(sm => sm.user_id);
    return sortMembersAlphabetically(members.filter(m => sectorUserIds.includes(m.user_id)));
  }

  function isUserAllowedInSector(userId: string, sectorId: string | null | undefined): boolean {
    if (!userId || userId === 'vago' || userId === 'disponivel') return true;
    if (!sectorId) return true;
    return getMembersForSector(sectorId).some((m) => m.user_id === userId);
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

  function hasUserSectorOverride(sectorId: string | null, userId: string | null): boolean {
    if (!sectorId || !userId) return false;
    return userSectorValues.has(`${sectorId}:${userId}`);
  }


  // ==========================================
  // FUNÇÕES DE CÁLCULO DE VALOR - USA LIB CENTRALIZADA
  // ==========================================
  
  // Import inline da lib para manter compatibilidade com o componente
  const STANDARD_SHIFT_HOURS = 12;
  
  function calculateDurationHours(startTime: string, endTime: string): number {
    if (!startTime || !endTime) return STANDARD_SHIFT_HOURS;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let hours = endH - startH;
    const minutes = endM - startM;
    if (hours < 0 || (hours === 0 && minutes < 0)) {
      hours += 24;
    }
    return hours + minutes / 60;
  }

  function calculateProRataValue(baseValue: number | null, durationHours: number): number | null {
    if (baseValue === null || baseValue === 0) return baseValue;
    if (durationHours === STANDARD_SHIFT_HOURS) return baseValue;
    return Number(((baseValue / STANDARD_SHIFT_HOURS) * durationHours).toFixed(2));
  }

  function durationToInputValue(hours: number): string {
    if (!Number.isFinite(hours) || hours <= 0) return '';
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
  }

  /**
   * FUNÇÃO ÚNICA DE CÁLCULO DE VALOR PARA EXIBIÇÃO
   * 
   * PRIORIDADE (consistente com Financeiro):
   * 1. Individual (user_sector_values) - APLICAR PRÓ-RATA (inclui zero explícito)
   * 2. assigned_value (editado na Escala) - USAR COMO ESTÁ (já pró-rata)
   * 3. Padrão do setor - APLICAR PRÓ-RATA
   * 
   * Esta função é usada em:
   * - Card do plantão
   * - Nome do médico atribuído
   * - Preview de valor
   */
  function getAssignmentDisplayInfo(
    assignment: { assigned_value: number | null; user_id: string },
    shift: { start_time: string; end_time: string; base_value: number | null; sector_id: string | null }
  ): { value: number | null; source: 'individual' | 'assigned' | 'base' | 'sector_default' | 'none'; durationHours: number } {
    const duration = calculateDurationHours(shift.start_time, shift.end_time);

    // PRIORIDADE 1: Valor individual (user_sector_values)
    // IMPORTANTE: quando existir override individual (inclusive 0), ele deve prevalecer
    // sobre assigned_value legado para manter a escala alinhada ao financeiro.
    // Aplicar pró-rata pois é valor base de 12h
    const userValue = getUserSectorValue(shift.sector_id, assignment.user_id, shift.start_time);
    const hasIndividualOverride = hasUserSectorOverride(shift.sector_id, assignment.user_id);
    if (hasIndividualOverride) {
      if (userValue === 0) return { value: 0, source: 'individual', durationHours: duration };
      if (userValue !== null) {
        return { value: calculateProRataValue(userValue, duration), source: 'individual', durationHours: duration };
      }
      // Se existe registro individual mas campo está em branco, ignora assigned_value legado
      // e cai para padrão do setor (ou sem valor).
    }

    // PRIORIDADE 2: assigned_value (editado na Escala)
    // USAR COMO ESTÁ - já foi calculado com pró-rata no momento do save
    if (!hasIndividualOverride && assignment.assigned_value !== null) {
      return { value: assignment.assigned_value, source: 'assigned', durationHours: duration };
    }

    // PRIORIDADE 3: Valor padrão do setor
    // Aplicar pró-rata pois é valor base de 12h
    const sectorValue = getSectorDefaultValue(shift.sector_id, shift.start_time);
    if (sectorValue !== null) {
      if (sectorValue === 0) return { value: 0, source: 'sector_default', durationHours: duration };
      return { value: calculateProRataValue(sectorValue, duration), source: 'sector_default', durationHours: duration };
    }

    return { value: null, source: 'none', durationHours: duration };
  }

  /**
   * Valor de exibição para o card do plantão (sem médico específico)
   * Usa apenas sector default com pró-rata
   */
  function getShiftDisplayValue(shift: { start_time: string; end_time: string; base_value: number | null; sector_id: string | null }): number | null {
    const duration = calculateDurationHours(shift.start_time, shift.end_time);
    
    // Se tem base_value explícito, usar como está (já está pró-rata se foi editado)
    if (shift.base_value !== null) {
      return shift.base_value;
    }
    
    // Senão, usar padrão do setor com pró-rata
    const sectorValue = getSectorDefaultValue(shift.sector_id, shift.start_time);
    return calculateProRataValue(sectorValue, duration);
  }

  /**
   * Valor de exibição para assignment (considera individual)
   * @deprecated Use getAssignmentDisplayInfo().value instead
   */
  function getAssignmentDisplayValue(
    assignment: { assigned_value: number | null; user_id: string },
    shift: { start_time: string; end_time: string; base_value: number | null; sector_id: string | null }
  ): number | null {
    return getAssignmentDisplayInfo(assignment, shift).value;
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

  function formatSupabaseError(error: any): string {
    if (!error) return 'Erro desconhecido';
    const parts = [error.message, error.details, error.hint, error.code]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    return parts.join(' | ') || 'Erro desconhecido';
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

  function normalizeString(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function resolveImportedMember(name: string): Member | null {
    const target = normalizeString(name);
    if (!target) return null;

    const exact = members.find((member) => {
      const full = normalizeString(member.profile?.full_name ?? '');
      const short = normalizeString(member.profile?.name ?? '');
      return full === target || short === target;
    });
    if (exact) return exact;

    if (target.length < 6) return null;

    return (
      members.find((member) => {
        const full = normalizeString(member.profile?.full_name ?? '');
        const short = normalizeString(member.profile?.name ?? '');
        return (
          (full && (full.includes(target) || target.includes(full))) ||
          (short && (short.includes(target) || target.includes(short)))
        );
      }) || null
    );
  }

  function normalizeHeader(value: unknown): string {
    return normalizeString(value).replace(/\s+/g, '_');
  }

  function readFieldByAliases(
    row: Record<string, unknown>,
    aliases: string[],
  ): unknown {
    const aliasSet = new Set(aliases.map((a) => normalizeHeader(a)));
    for (const [key, value] of Object.entries(row)) {
      if (aliasSet.has(normalizeHeader(key))) {
        return value;
      }
    }
    return undefined;
  }

  function parseImportDate(value: unknown): string | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return format(value, 'yyyy-MM-dd');
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      if (!Number.isNaN(date.getTime())) return format(date, 'yyyy-MM-dd');
    }

    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (br) {
      const day = Number(br[1]);
      const month = Number(br[2]);
      const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) return format(date, 'yyyy-MM-dd');
    }

    const iso = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (iso) {
      const year = Number(iso[1]);
      const month = Number(iso[2]);
      const day = Number(iso[3]);
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) return format(date, 'yyyy-MM-dd');
    }

    return null;
  }

  function parseImportTime(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const totalMinutes = Math.round(value * 24 * 60);
      const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
      const mm = String(totalMinutes % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }

    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const match = raw.match(/^(\d{1,2}):?(\d{2})/);
    if (!match) return null;

    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function parseEscalasGridLayout(rawMatrix: Array<Array<string | number | Date>>): {
    parsed: ImportedShiftRow[];
    errors: string[];
  } {
    const parsed: ImportedShiftRow[] = [];
    const errors: string[] = [];

    if (!rawMatrix.length) return { parsed, errors };

    const sectorByNormalizedName = new Map(
      sectors.map((s) => [normalizeString(s.name), s]),
    );
    const defaultSector =
      (filterSector && filterSector !== 'all'
        ? sectors.find((s) => s.id === filterSector)
        : null) || sectors[0] || null;

    const resolveSectorFromCell = (value: unknown): Sector | null => {
      const text = String(value ?? '').trim();
      if (!text) return null;
      const norm = normalizeString(text);
      const exact = sectorByNormalizedName.get(norm);
      if (exact) return exact;

      for (const sector of sectors) {
        const sNorm = normalizeString(sector.name);
        if (norm.includes(sNorm) || sNorm.includes(norm)) return sector;
      }
      return null;
    };

    const findNearestSector = (rowIndex: number): Sector | null => {
      for (let r = rowIndex; r >= Math.max(0, rowIndex - 14); r--) {
        for (const cell of rawMatrix[r] || []) {
          const sector = resolveSectorFromCell(cell);
          if (sector) return sector;
        }
      }
      return null;
    };

    const periodRegex = /(\d{2})\/(\d{2})\/(\d{4})\s*[~-]\s*(\d{2})\/(\d{2})\/(\d{4})/;
    let baseYear = currentDate.getFullYear();
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    for (let r = 0; r < Math.min(20, rawMatrix.length); r++) {
      for (const cell of rawMatrix[r] || []) {
        const text = String(cell ?? '').trim();
        const match = text.match(periodRegex);
        if (match) {
          baseYear = Number(match[3]);
          periodStart = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
          periodEnd = new Date(Number(match[6]), Number(match[5]) - 1, Number(match[4]));
          break;
        }
      }
    }

    const dayRegex = /\b(?:SEG|TER|QUA|QUI|SEX|SAB|SÁB|DOM)\s*(\d{1,2})\/(\d{1,2})\b/i;
    const ignoreTokens = ['escalas', 'profissional de plantao', 'profissional de plantão', 'local', 'gerado em'];
    const isIgnored = (value: string) => {
      const norm = normalizeString(value);
      if (!norm) return true;
      if (ignoreTokens.some((token) => norm.includes(token))) return true;
      if (/^\d{2}\/\d{2}\/\d{4}/.test(norm)) return true;
      if (/^(seg|ter|qua|qui|sex|sab|dom)\s*\d{1,2}\/\d{1,2}$/.test(norm)) return true;
      return false;
    };

    const dayRows: number[] = [];
    for (let r = 0; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      if (row.some((cell) => dayRegex.test(String(cell ?? '').trim()))) {
        dayRows.push(r);
      }
    }

    for (let idx = 0; idx < dayRows.length; idx++) {
      const r = dayRows[idx];
      const nextDayRow = dayRows[idx + 1] ?? rawMatrix.length;
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cellText = String(row[c] ?? '').trim();
        const dayMatch = cellText.match(dayRegex);
        if (!dayMatch) continue;

        const day = Number(dayMatch[1]);
        const month = Number(dayMatch[2]);
        const date = new Date(baseYear, month - 1, day);
        if (Number.isNaN(date.getTime())) continue;
        if (periodStart && date < periodStart) continue;
        if (periodEnd && date > periodEnd) continue;

        const sector = findNearestSector(r) || defaultSector;
        if (!sector) {
          errors.push(`Linha ${r + 1}: não foi possível identificar o setor para ${cellText}.`);
          continue;
        }

        const namesByRange = new Map<string, string[]>();
        let currentRange = { start: '07:00', end: '19:00' };
        namesByRange.set(`${currentRange.start}|${currentRange.end}`, []);

        for (let rr = r + 1; rr < nextDayRow; rr++) {
          const raw = String(rawMatrix[rr]?.[c] ?? '').trim();
          if (!raw) continue;

          const rangeMatches = Array.from(raw.matchAll(/(\d{1,2}:\d{2})\s*[~-]\s*(\d{1,2}:\d{2})/g));
          if (rangeMatches.length > 0) {
            const first = rangeMatches[0];
            const start = parseImportTime(first[1]);
            const end = parseImportTime(first[2]);
            if (start && end) {
              currentRange = { start, end };
              const key = `${start}|${end}`;
              if (!namesByRange.has(key)) namesByRange.set(key, []);
            }
            continue;
          }

          const parts = raw.split(/\n|;|,|\|/g).map((p) => p.trim()).filter(Boolean);
          const cleanNames = parts.filter((part) => !isIgnored(part));
          if (cleanNames.length === 0) continue;

          const key = `${currentRange.start}|${currentRange.end}`;
          if (!namesByRange.has(key)) namesByRange.set(key, []);
          namesByRange.get(key)!.push(...cleanNames);
        }

        for (const [rangeKey, importedNames] of namesByRange.entries()) {
          const [start, end] = rangeKey.split('|');
          const uniqueNames = Array.from(new Set(importedNames.map((n) => n.trim()).filter(Boolean)));

          if (uniqueNames.length === 0) {
            parsed.push({
              sector_id: sector.id,
              sector_name: sector.name,
              shift_date: format(date, 'yyyy-MM-dd'),
              start_time: start,
              end_time: end,
              hospital: sector.name,
              location: null,
              base_value: null,
              notes: 'Importado da escala impressa',
              title: generateShiftTitle(start, end),
            });
            continue;
          }

          uniqueNames.forEach((name) => {
            parsed.push({
              sector_id: sector.id,
              sector_name: sector.name,
              shift_date: format(date, 'yyyy-MM-dd'),
              start_time: start,
              end_time: end,
              hospital: sector.name,
              location: null,
              base_value: null,
              notes: `Importado da escala impressa - ${name}`,
              title: generateShiftTitle(start, end),
              assignee_names: [name],
            });
          });
        }
      }
    }

    const dedup = new Map<string, ImportedShiftRow>();
    for (const row of parsed) {
      const assigneeKey = (row.assignee_names?.[0] || '').toLowerCase();
      const key = `${row.sector_id}|${row.shift_date}|${row.start_time}|${row.end_time}|${assigneeKey}`;
      if (!dedup.has(key)) dedup.set(key, row);
    }

    return { parsed: Array.from(dedup.values()), errors };
  }

  async function handleImportScheduleFile(file: File) {
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
      notifyWarning('Arquivo inválido', 'Use um arquivo .xlsx, .xls ou .csv.');
      return;
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rawMatrix = XLSX.utils.sheet_to_json<(string | number | Date)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    });

    if (!rawMatrix.length) {
      setImportPreviewRows([]);
      setImportErrors(['Planilha vazia.']);
      return;
    }

    const sectorAliases = [
      'setor',
      'sector',
      'setor_nome',
      'nome_setor',
      'unidade',
      'setor_local',
      'setor/local',
      'hospital',
      'hospital_setor',
    ];
    const dateAliases = ['data', 'date', 'shift_date', 'dia'];
    const startAliases = ['inicio', 'início', 'start', 'start_time', 'hora_inicio'];
    const endAliases = ['fim', 'término', 'termino', 'end', 'end_time', 'hora_fim'];

    const groups = [sectorAliases, dateAliases, startAliases, endAliases];
    const maxHeaderScan = Math.min(12, rawMatrix.length);

    const rowContainsAlias = (row: unknown[], aliases: string[]) => {
      const normalizedCells = row.map((cell) => normalizeHeader(cell));
      return aliases.some((alias) => normalizedCells.includes(normalizeHeader(alias)));
    };

    let headerRowIndex = -1;
    let bestScore = -1;
    for (let i = 0; i < maxHeaderScan; i++) {
      const row = rawMatrix[i] || [];
      const score = groups.reduce((acc, aliases) => acc + (rowContainsAlias(row as unknown[], aliases) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        headerRowIndex = i;
      }
    }

    const useDetectedHeader = bestScore >= 2 && headerRowIndex >= 0;
    const fallbackHeaders = ['setor', 'data', 'inicio', 'fim', 'hospital', 'local', 'valor', 'observacao', 'titulo'];
    const headers = useDetectedHeader
      ? (rawMatrix[headerRowIndex] || []).map((cell, idx) => String(cell ?? '').trim() || `col_${idx + 1}`)
      : fallbackHeaders;
    const dataRows = useDetectedHeader ? rawMatrix.slice(headerRowIndex + 1) : rawMatrix;
    const firstDataLine = useDetectedHeader ? headerRowIndex + 2 : 1;

    const rows = dataRows.map((cells) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        obj[header] = cells?.[index] ?? '';
      });
      return obj;
    });

    if (!rows.length) {
      setImportPreviewRows([]);
      setImportErrors(['Planilha sem dados após o cabeçalho.']);
      return;
    }

    // Detecta layout de escala impressa em grade:
    // "ESCALAS", "PROFISSIONAL DE PLANTÃO", dias em colunas etc.
    // Nesses casos, não devemos passar pelo parser tabular.
    const lookaheadText = rawMatrix
      .slice(0, 20)
      .flat()
      .map((cell) => normalizeString(cell))
      .join(' | ');
    const looksLikeEscalasGrid =
      lookaheadText.includes('escalas') &&
      lookaheadText.includes('profissional de plant');

    if (looksLikeEscalasGrid) {
      const fallback = parseEscalasGridLayout(rawMatrix);
      setImportFileName(file.name);

      if (fallback.parsed.length > 0) {
        setImportPreviewRows(fallback.parsed);
        setImportErrors([
          ...fallback.errors,
          'Formato de grade detectado: plantões por profissional/horário preparados para importação.',
        ]);
        notifyInfo('Arquivo carregado', `${fallback.parsed.length} dia(s) identificado(s) na escala impressa.`);
        return;
      }

      setImportPreviewRows([]);
      setImportErrors([
        'Formato de grade detectado, mas não foi possível identificar dias/setores automaticamente.',
      ]);
      notifyWarning('Importação sem linhas válidas', 'Não foi possível interpretar a grade desta planilha.');
      return;
    }

    const sectorByNormalizedName = new Map(
      sectors.map((s) => [normalizeString(s.name), s]),
    );

    const parsed: ImportedShiftRow[] = [];
    const errors: string[] = [];

    let sectorNotFoundCount = 0;

    rows.forEach((row, index) => {
      const line = firstDataLine + index;

      const isEmptyRow = Object.values(row).every((value) => String(value ?? '').trim() === '');
      if (isEmptyRow) return;

      const rawHospital = readFieldByAliases(row, ['hospital', 'hospital_nome']);
      const rawUnit = readFieldByAliases(row, ['unidade', 'setor_unidade']);
      const rawSector =
        readFieldByAliases(row, sectorAliases) ??
        rawUnit ??
        rawHospital;
      const rawDate = readFieldByAliases(row, dateAliases);
      const rawStart = readFieldByAliases(row, startAliases);
      const rawEnd = readFieldByAliases(row, endAliases);
      const rawLocation = readFieldByAliases(row, ['local', 'location', 'sala']);
      const rawBase = readFieldByAliases(row, ['valor', 'valor_base', 'base_value', 'valorbase']);
      const rawNotes = readFieldByAliases(row, ['obs', 'observacao', 'observação', 'notes']);
      const rawTitle = readFieldByAliases(row, ['titulo', 'título', 'title']);

      const sectorName = String(rawSector ?? '').trim();
      const sector = sectorByNormalizedName.get(normalizeString(sectorName));
      if (!sector) {
        sectorNotFoundCount += 1;
        errors.push(`Linha ${line}: setor não encontrado (${sectorName || 'vazio'}).`);
        return;
      }

      const shiftDate = parseImportDate(rawDate);
      if (!shiftDate) {
        errors.push(`Linha ${line}: data inválida (${String(rawDate ?? '').trim() || 'vazia'}).`);
        return;
      }

      const startTime = parseImportTime(rawStart);
      const endTime = parseImportTime(rawEnd);
      if (!startTime || !endTime) {
        errors.push(`Linha ${line}: horário inválido (início/fim).`);
        return;
      }

      const hospital = String(rawHospital ?? '').trim() || String(rawUnit ?? '').trim() || sector.name;
      const location = String(rawLocation ?? '').trim() || null;
      const baseValue = parseMoneyNullable(rawBase);
      const notes = String(rawNotes ?? '').trim() || null;
      const title = String(rawTitle ?? '').trim() || generateShiftTitle(startTime, endTime);

      parsed.push({
        sector_id: sector.id,
        sector_name: sector.name,
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        hospital,
        location,
        base_value: baseValue,
        notes,
        title,
      });
    });

    const fallback = parseEscalasGridLayout(rawMatrix);
    const shouldPreferFallback =
      fallback.parsed.length > 0 &&
      (
        parsed.length === 0 ||
        fallback.parsed.length > parsed.length ||
        sectorNotFoundCount >= Math.max(6, parsed.length)
      );

    if (shouldPreferFallback) {
      setImportPreviewRows(fallback.parsed);
      setImportErrors([
        ...fallback.errors,
        'Formato de grade detectado: plantões por profissional/horário preparados para importação.',
      ]);
      setImportFileName(file.name);
      notifyInfo('Arquivo carregado', `${fallback.parsed.length} dia(s) identificado(s) na escala impressa.`);
      return;
    }

    setImportPreviewRows(parsed);
    setImportErrors(errors);
    setImportFileName(file.name);

    if (!parsed.length) {
      notifyWarning('Importação sem linhas válidas', 'Revise o arquivo e tente novamente.');
      return;
    }

    notifyInfo('Arquivo carregado', `${parsed.length} linha(s) pronta(s) para importar.`);
  }

  async function confirmImportSchedule() {
    if (!currentTenantId || importPreviewRows.length === 0) return;

    setImportingShifts(true);
    try {
      let createdCount = 0;
      let assignedCount = 0;
      const unmatchedNames = new Set<string>();

      for (const row of importPreviewRows) {
        const shiftId = await insertAdminShiftAndGetId({
          tenant_id: currentTenantId,
          title: row.title,
          hospital: row.hospital,
          location: row.location,
          shift_date: row.shift_date,
          start_time: row.start_time,
          end_time: row.end_time,
          base_value: row.base_value,
          notes: row.notes,
          sector_id: row.sector_id,
          updated_by: user?.id,
        });
        createdCount += 1;

        const names = (row.assignee_names || []).map((n) => n.trim()).filter(Boolean);
        for (const importedName of names) {
          const member = resolveImportedMember(importedName);
          if (!member?.user_id) {
            unmatchedNames.add(importedName);
            continue;
          }

          if (!isUserAllowedInSector(member.user_id, row.sector_id || null)) {
            unmatchedNames.add(`${importedName} (fora do setor)`);
            continue;
          }

          const assignedValue = resolveValue({
            raw: row.base_value ?? '',
            sector_id: row.sector_id || null,
            start_time: row.start_time,
            end_time: row.end_time,
            user_id: member.user_id,
            useSectorDefault: true,
            applyProRata: true,
          });

          try {
            await upsertAdminAssignment({
              tenantId: currentTenantId,
              shiftId,
              userId: member.user_id,
              assignedValue,
              updatedBy: user?.id,
            });
            assignedCount += 1;
          } catch {
            unmatchedNames.add(`${importedName} (erro de vínculo)`);
          }
        }
      }

      const unmatchedList = Array.from(unmatchedNames);
      const unmatchedText =
        unmatchedList.length > 0
          ? ` Não vinculados: ${unmatchedList.slice(0, 8).join(', ')}${unmatchedList.length > 8 ? '...' : ''}.`
          : '';
      notifySuccess(
        'Escala importada',
        `${createdCount} plantão(ões) criado(s), ${assignedCount} vínculo(s) de plantonista.${unmatchedText}`,
      );
      setImportDialogOpen(false);
      setImportPreviewRows([]);
      setImportErrors([]);
      setImportFileName('');
      await fetchData();
    } catch (error) {
      notifyError('importar escala', error, 'Não foi possível concluir a importação.');
    } finally {
      setImportingShifts(false);
    }
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

    const endTime = params.end_time || (isNightShift(params.start_time, '') ? '07:00' : '19:00');
    const duration = calculateDurationHours(params.start_time, endTime);
    const shouldApplyProRata = params.applyProRata !== false && duration !== 12;
    
    // If user typed a value explicitly (including 0), treat it as the FINAL value.
    // IMPORTANT: We DO NOT apply pro-rata here. Pro-rata is ONLY for sector/individual defaults
    // (which are 12h base values). This ensures that if you type "800" for a 6h shift, the saved
    // assigned_value is exactly 800 and Financeiro will sum 800.
    if (rawStr) {
      const parsed = parseMoneyNullable(rawStr);
      if (parsed === null) return null;
      return parsed;
    }

    if (!params.useSectorDefault) return null;
    
    // Check for individual plantonista value first
    if (params.user_id && params.user_id !== 'vago' && params.user_id !== 'disponivel') {
      const userValue = getUserSectorValue(params.sector_id, params.user_id, params.start_time);
      // 0 é valor explícito e deve prevalecer sobre padrão do setor.
      if (userValue !== null) {
        return shouldApplyProRata ? calculateProRataValue(userValue, duration) : userValue;
      }
    }
    
    // Fall back to sector default
    const sectorValue = getSectorDefaultValue(params.sector_id, params.start_time);
    // IMPORTANT: Only use sector default if it has a positive value
    // If sector default is 0 or null, return null (no value defined)
    if (sectorValue !== null && sectorValue > 0) {
      return shouldApplyProRata ? calculateProRataValue(sectorValue, duration) : sectorValue;
    }
    
    return null;
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

  // If a shift was clicked in the month/week card, keep the day dialog focused on that single shift.
  function getDisplayedShiftsForDayDialog(date: Date) {
    const allShifts = sortShiftsByTimeAndName(getShiftsForDayDialog(date));
    if (!dayDialogFocusedShiftId) return allShifts;
    const focused = allShifts.find((s) => s.id === dayDialogFocusedShiftId);
    return focused ? [focused] : allShifts;
  }

  // Get assignments for a shift
  function getAssignmentsForShift(shiftId: string) {
    return assignments.filter(a => a.shift_id === shiftId);
  }

  // Refresh assignment rows for a specific set of shifts directly from table
  // and merge into local state. Used as a resilient fallback after save operations.
  async function refreshAssignmentsForShiftIds(shiftIds: string[]) {
    if (shiftIds.length === 0) return;
    const uniqueIds = Array.from(new Set(shiftIds));

    let data: any[] = [];
    try {
      data = await fetchAdminAssignmentsByShiftIds(uniqueIds);
    } catch (error) {
      console.error('[ShiftCalendar] refreshAssignmentsForShiftIds error', error);
      return;
    }

    const allowedUserIds = new Set(members.map((m) => m.user_id));
    const mapped = ((data || []) as any[])
      .filter((row) => allowedUserIds.has(row.user_id))
      .map((row) => ({
      id: row.id,
      shift_id: row.shift_id,
      user_id: row.user_id,
      assigned_value: row.assigned_value,
      status: row.status,
      profile: {
        name: row.profile?.name ?? null,
        full_name: row.profile?.full_name ?? null,
      },
    })) as unknown as ShiftAssignment[];

    setAssignments((prev) => {
      const kept = prev.filter((a) => !uniqueIds.includes(a.shift_id));
      return [...kept, ...mapped];
    });
  }

  // Refresh assignment rows for a specific day and merge into local state.
  // This avoids stale "VAGO" rendering when day dialog is opened right after edits/imports.
  async function refreshAssignmentsForDate(date: Date) {
    if (!currentTenantId || !user?.id) return;

    const dayStr = format(date, 'yyyy-MM-dd');
    const dayShiftIds = new Set(
      shifts
        .filter((s) => isSameDay(parseISO(s.shift_date), date))
        .map((s) => s.id)
    );
    if (dayShiftIds.size === 0) return;

    // Build mapped rows from RPC when available.
    const allowedUserIds = new Set(members.map((m) => m.user_id));
    let data: any[] = [];
    let error: unknown = null;
    try {
      data = await fetchAdminAssignmentRange({
        tenantId: currentTenantId,
        start: dayStr,
        end: dayStr,
      });
    } catch (rpcError) {
      error = rpcError;
    }

    let mapped: ShiftAssignment[] = ((data ?? []) as any[])
      .filter((row) => allowedUserIds.has(row.user_id))
      .map((row) => {
      const member = members.find((m) => m.user_id === row.user_id);
      const fallbackName = getMemberDisplayName(member);
      const resolvedFullName = row.full_name ?? null;
      const resolvedName = row.name ?? fallbackName ?? null;
      return {
        id: row.id,
        shift_id: row.shift_id,
        user_id: row.user_id,
        assigned_value: row.assigned_value,
        status: row.status,
        profile: { name: resolvedName, full_name: resolvedFullName },
      } as unknown as ShiftAssignment;
    });

    // Harden against transient empty RPC responses:
    // confirm with direct table query before clearing any existing day assignments.
    if (error || mapped.length === 0) {
      if (error) {
        console.error('[ShiftCalendar] refreshAssignmentsForDate rpc error', error);
      }

      let direct: any[] = [];
      try {
        direct = await fetchAdminAssignmentsByShiftIds(Array.from(dayShiftIds));
      } catch (directError) {
        console.error('[ShiftCalendar] refreshAssignmentsForDate fallback error', directError);
        return;
      }

      mapped = (direct as any[])
        .filter((row) => allowedUserIds.has(row.user_id))
        .map((row) => ({
        id: row.id,
        shift_id: row.shift_id,
        user_id: row.user_id,
        assigned_value: row.assigned_value,
        status: row.status,
        profile: {
          name: row.profile?.name ?? null,
          full_name: row.profile?.full_name ?? null,
        },
      })) as unknown as ShiftAssignment[];
    }

    setAssignments((prev) => {
      const kept = prev.filter((a) => !dayShiftIds.has(a.shift_id));
      return [...kept, ...mapped];
    });
  }

  const editingCurrentAssignment = useMemo(() => {
    if (!editingShift) return null;
    return assignments.find((a) => a.shift_id === editingShift.id) || null;
  }, [assignments, editingShift]);

  function getMemberDisplayName(member: Member | null | undefined): string {
    const fullName = member?.profile?.full_name?.trim();
    const name = member?.profile?.name?.trim();
    return fullName || name || 'Sem nome';
  }

  // Helper to resolve assignment name with fallback to members list
  function getAssignmentName(assignment: ShiftAssignment): string {
    // Primary: use profile name from RPC response
    if (assignment.profile?.full_name?.trim()) {
      return assignment.profile.full_name.trim();
    }
    if (assignment.profile?.name?.trim()) {
      return assignment.profile.name.trim();
    }
    // Fallback: look up in members list by user_id
    const member = members.find(m => m.user_id === assignment.user_id);
    return getMemberDisplayName(member);
  }

  function stripShiftStatusTags(notes?: string | null): string {
    return (notes || '')
      .replace('[DISPONÍVEL]', '')
      .replace('[VAGO]', '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getOfferName(offer: ShiftOffer): string {
    const fullName = offer.profile?.full_name?.trim();
    const name = offer.profile?.name?.trim();
    if (fullName) return fullName;
    if (name) return name;
    const member = members.find((m) => m.user_id === offer.user_id);
    return getMemberDisplayName(member);
  }

  const getUserSectorIds = useCallback((userId: string): string[] => {
    return sectorMemberships.filter((sm) => sm.user_id === userId).map((sm) => sm.sector_id);
  }, [sectorMemberships]);

  function openTransferDialog(assignment: ShiftAssignment, sourceShift: Shift) {
    const userId = assignment.user_id;
    const memberSectors = new Set(getUserSectorIds(userId));
    const firstAllowedSectorId =
      sectors
        .filter((s) => s.id !== sourceShift.sector_id)
        .find((s) => memberSectors.has(s.id))?.id || '';
    const firstAllowedTargetShiftId =
      shifts
        .filter((s) => s.id !== sourceShift.id)
        .filter((s) => s.shift_date === sourceShift.shift_date)
        .filter((s) => s.sector_id === firstAllowedSectorId)
        .filter((s) => !assignments.some((a) => a.shift_id === s.id && a.user_id === userId))
        .sort((a, b) => `${a.shift_date}T${a.start_time}`.localeCompare(`${b.shift_date}T${b.start_time}`))[0]?.id || '';

    setTransferAssignment(assignment);
    setTransferSourceShift(sourceShift);
    setTransferTargetSectorId(firstAllowedSectorId);
    setTransferTargetShiftId(firstAllowedTargetShiftId);
    setTransferDialogOpen(true);
  }

  function openTransferFromBulkEdit(shiftId: string) {
    const sourceShift = shifts.find((s) => s.id === shiftId);
    const assignment = assignments.find((a) => a.shift_id === shiftId);
    if (!sourceShift || !assignment) {
      notifyWarning('Transferência indisponível', 'Este plantão precisa ter um plantonista atribuído para transferir.');
      return;
    }

    setBulkEditDialogOpen(false);
    openTransferDialog(assignment, sourceShift);
  }

  const transferAllowedSectors = useMemo(() => {
    if (!transferAssignment || !transferSourceShift) return [];
    const userId = transferAssignment.user_id;
    const memberSectors = new Set(getUserSectorIds(userId));
    return sectors
      .filter((s) => memberSectors.has(s.id))
      .filter((s) => s.id !== transferSourceShift.sector_id)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [transferAssignment, transferSourceShift, getUserSectorIds, sectors]);

  const transferTargetCandidates = useMemo(() => {
    if (!transferAssignment || !transferSourceShift || !transferTargetSectorId) return [];
    const userId = transferAssignment.user_id;
    return shifts
      .filter((s) => s.id !== transferSourceShift.id)
      .filter((s) => s.shift_date === transferSourceShift.shift_date) // transfer only within the same day
      .filter((s) => s.sector_id === transferTargetSectorId)
      .filter((s) => !assignments.some((a) => a.shift_id === s.id && a.user_id === userId))
      .sort((a, b) => `${a.shift_date}T${a.start_time}`.localeCompare(`${b.shift_date}T${b.start_time}`));
  }, [transferAssignment, transferSourceShift, transferTargetSectorId, shifts, assignments]);

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
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      });

  // Get day offset for first day of month (0-6, Monday-Sunday)
  const firstDayOfWeek = viewMode === 'month' ? (startOfMonth(currentDate).getDay() + 6) % 7 : 0;

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
    const autoTitle = generateShiftTitle(formData.start_time, formData.end_time);
    
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
      try {
        await updateAdminShiftById(editingShift.id, shiftUpdateData);
      } catch (error) {
        notifyError('atualizar plantão', error, 'Não foi possível atualizar o plantão.');
        return;
      }

      const confirmed = await confirmAdminShiftExists(editingShift.id);
      if (!confirmed) {
        notifyError('salvar plantão', 'Atualização bloqueada (permissão/tenant).');
        return;
      }

      // Handle assignment update when editing
      try {
        const currentAssignment = assignments.find(a => a.shift_id === editingShift.id);

        const isRealUser =
          formData.assigned_user_id &&
          formData.assigned_user_id !== 'vago' &&
          formData.assigned_user_id !== 'disponivel';

        if (isRealUser && !isUserAllowedInSector(formData.assigned_user_id, formData.sector_id || null)) {
          notifyWarning('Plantonista inválido para o setor', 'Selecione um plantonista cadastrado no setor deste plantão.');
          return;
        }

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
              const updData = await updateAdminAssignmentValue({
                assignmentId: currentAssignment.id,
                assignedValue,
                updatedBy: user?.id,
              });
              if (!updData) throw new Error('Atualização do plantonista bloqueada (permissão/tenant).');
            } else {
              // Different user - this is a TRANSFER
              const oldUserName = getAssignmentName(currentAssignment);
              const newUserMember = members.find(m => m.user_id === formData.assigned_user_id);
              const newUserName = newUserMember?.profile?.name || 'Desconhecido';
              
              const upData = await upsertAdminAssignment({
                tenantId: currentTenantId,
                shiftId: editingShift.id,
                userId: formData.assigned_user_id,
                assignedValue,
                updatedBy: user?.id,
              });
              if (!upData?.id) {
                throw new Error('Não foi possível salvar o plantonista (permissão/tenant).');
              }

              const deletedRows = await deleteAdminAssignment(currentAssignment.id);
              if (deletedRows.length === 0) {
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
            const upData = await upsertAdminAssignment({
              tenantId: currentTenantId,
              shiftId: editingShift.id,
              userId: formData.assigned_user_id,
              assignedValue,
              updatedBy: user?.id,
            });
            if (!upData?.id) {
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

            const deletedRows = await deleteAdminAssignment(currentAssignment.id);
            if (deletedRows.length === 0) {
              throw new Error('Não foi possível remover o plantonista (permissão/tenant).');
            }
          }
        }
      } catch (assignmentError: any) {
        console.error('[ShiftCalendar] assignment update failed:', assignmentError);
        notifyError('salvar plantão', assignmentError, 'Falha ao atualizar o plantonista.');
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
            duplicatedShiftId = await insertAdminShiftAndGetId(duplicatedShiftData as any);
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

            await upsertAdminAssignment({
              tenantId: currentTenantId,
              shiftId: duplicatedShiftId,
              userId: formData.assigned_user_id,
              assignedValue,
              updatedBy: user?.id,
            });
          }
        }

        console.info('[ShiftCalendar] shift updated', {
          shiftId: editingShift.id,
          tenantId: currentTenantId,
          repeatWeeks,
        });
        notifySuccess('Plantão atualizado', `${repeatWeeks} cópias criadas.`);
      } else {
        console.info('[ShiftCalendar] shift updated', {
          shiftId: editingShift.id,
          tenantId: currentTenantId,
        });
        notifySuccess('Plantão atualizado');
      }

      await refreshAssignmentsForShiftIds([editingShift.id]);
      await fetchData();
      closeShiftDialog();
      setDayDialogOpen(false);
      return;
    } else {
      // CREATE
      const dayQuantity = Math.max(0, Math.min(20, Number(formData.day_quantity) || 0));
      const nightQuantity = Math.max(0, Math.min(20, Number(formData.night_quantity) || 0));
      const typedTotal = dayQuantity + nightQuantity;
      const quantity = Math.max(1, Math.min(20, typedTotal > 0 ? typedTotal : Number(formData.quantity) || 1));
      const repeatWeeks = formData.repeat_weeks || 0;

      // Helper to check if a user_id is a real user (not vago/disponivel)
      const isRealUserId = (userId: string | undefined | null): boolean => {
        return !!userId && userId !== 'vago' && userId !== 'disponivel';
      };

      let createdCount = 0;
      let errorsCount = 0;

      const baseDate = parseISO(formData.shift_date);

      // If multiShifts is filled, use it (one entry per shift) otherwise build from day/night quantities.
      const useMultiRows = quantity > 1 && multiShifts.length > 0;
      const typedRows =
        typedTotal > 0
          ? buildRowsByShiftType(dayQuantity, nightQuantity).map((row, index) =>
              typedTotal === 1 && index === 0
                ? { ...row, user_id: formData.assigned_user_id }
                : row
            )
          : Array.from({ length: quantity }).map(() => ({
              user_id: formData.assigned_user_id,
              start_time: formData.start_time,
              end_time: formData.end_time,
            }));

      const rows = (useMultiRows ? multiShifts : typedRows)
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
              createdShiftId = await insertAdminShiftAndGetId({
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
            if (!isUserAllowedInSector(rowAssigned, formData.sector_id || null)) {
              console.warn('[ShiftCalendar] assignment skipped: user is not sector member', {
                userId: rowAssigned,
                sectorId: formData.sector_id || null,
              });
              errorsCount++;
              continue;
            }

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

            try {
              await upsertAdminAssignment({
                tenantId: currentTenantId,
                shiftId: createdShiftId,
                userId: rowAssigned,
                assignedValue: rowAssignedValue,
                updatedBy: user?.id,
              });
            } catch (assignErr) {
              console.error('[ShiftCalendar] assignment failed:', assignErr);
              errorsCount++;
            }
          }
        }
      }

      if (errorsCount > 0) {
        notifyError(
          'criar plantões',
          `${errorsCount} erro(s)`,
          `Criados: ${createdCount}. Alguns plantões não puderam ser salvos. Veja o console para detalhes.`,
        );
      } else {
        notifySuccess('Cadastro de plantões', `${createdCount} plantão(ões) criado(s).`);
      }

      if (selectedDate) {
        await refreshAssignmentsForDate(selectedDate);
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
      const nameA = getMemberDisplayName(a).toLowerCase();
      const nameB = getMemberDisplayName(b).toLowerCase();
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }

  // Clear all selections
  function clearSelection() {
    if (selectedShiftIds.size === 0 && selectedDates.size === 0) {
      notifyWarning('Nenhuma seleção para limpar');
      return;
    }
    setSelectedShiftIds(new Set());
    setSelectedDates(new Set());
    notifySuccess('Seleção limpa');
  }

  // Bulk create shifts for selected dates
  async function handleBulkCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTenantId || selectedDates.size === 0) return;

    const autoTitle = generateShiftTitle(formData.start_time, formData.end_time);
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
        updated_by: user?.id,
      };

      let newShiftId: string;
      try {
        newShiftId = await insertAdminShiftAndGetId(shiftData);
      } catch (error) {
        errorCount++;
        continue;
      }
      successCount++;

      // Create assignment if a real user was selected
      if (formData.assigned_user_id && 
          formData.assigned_user_id !== 'vago' && 
          formData.assigned_user_id !== 'disponivel' && 
          newShiftId) {
        if (!isUserAllowedInSector(formData.assigned_user_id, formData.sector_id || null)) {
          errorCount++;
          continue;
        }

        const assignedValue = resolveValue({
          raw: formData.base_value,
          sector_id: formData.sector_id || null,
          start_time: formData.start_time,
          end_time: formData.end_time,
          user_id: formData.assigned_user_id,
          useSectorDefault: formData.use_sector_default,
          applyProRata: true,
        });

        try {
          await upsertAdminAssignment({
            tenantId: currentTenantId,
            shiftId: newShiftId,
            userId: formData.assigned_user_id,
            assignedValue,
            updatedBy: user?.id,
          });
        } catch {
          errorCount++;
        }
      }
    }

    if (errorCount > 0) {
      notifyError('criar plantões em lote', `${errorCount} erro(s)`, `${successCount} criado(s).`);
    } else {
      notifySuccess('Cadastro em lote', `${successCount} plantão(ões) criado(s).`);
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
      const nameA = assignmentA ? getAssignmentName(assignmentA).toLowerCase() : 'zzzzz'; // Put unassigned at end
      const nameB = assignmentB ? getAssignmentName(assignmentB).toLowerCase() : 'zzzzz';
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }

  async function handleDeleteShift(id: string) {
    if (!confirm('Deseja excluir este plantão e todas as atribuições?')) return;

    try {
      await deleteAdminShiftById(id);
    } catch (error) {
      notifyError('excluir plantão', error, 'Não foi possível excluir o plantão.');
      return;
    }

    notifySuccess('Exclusão de plantão');
    await fetchData();
    closeDayDialog();
  }

  async function handleDeleteDayShifts() {
    if (!selectedDate || deletingDayShifts) return;
    const dayShifts = getShiftsForDayDialog(selectedDate);
    if (dayShifts.length === 0) {
      notifyWarning('Nenhum plantão neste dia');
      return;
    }

    const dateLabel = format(selectedDate, 'dd/MM/yyyy');
    if (!confirm(`Deseja excluir todos os ${dayShifts.length} plantão(ões) de ${dateLabel}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setDeletingDayShifts(true);
    const ids = dayShifts.map((s) => s.id);

    try {
      // Primary path: single bulk delete for better performance.
      try {
        await deleteAdminShiftsByIds(ids);
        notifySuccess('Exclusão do dia', `${dayShifts.length} plantão(ões) excluído(s).`);
      } catch (bulkError: any) {
        // Fallback path: delete one by one to avoid transient/batch-specific failures.
        console.warn('[ShiftCalendar] bulk day delete failed, trying per-shift fallback:', bulkError);

        let deletedCount = 0;
        const failures: string[] = [];

        for (const shiftId of ids) {
          try {
            await deleteAdminShiftById(shiftId);
            deletedCount += 1;
          } catch (singleError: any) {
            failures.push(singleError?.message || 'Falha desconhecida');
          }
        }

        if (deletedCount === 0) {
          notifyError('excluir plantões do dia', bulkError.message || failures[0], 'Falha ao excluir plantões.');
          return;
        }

        if (failures.length > 0) {
          notifyError('excluir plantões do dia', failures[0], `Exclusão parcial (${deletedCount}/${ids.length}).`);
        } else {
          notifySuccess('Exclusão do dia', `${deletedCount} plantão(ões) excluído(s).`);
        }
      }

      setSelectedShiftIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      await fetchData();
      setDayDialogOpen(false);
      setDayDialogSectorId(null);
      setSelectedDate(null);
    } finally {
      setDeletingDayShifts(false);
    }
  }

  function toggleDayShiftSelection(shiftId: string) {
    setDaySelectedShiftIds((prev) => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId);
      else next.add(shiftId);
      return next;
    });
  }

  function toggleSelectAllDisplayedDayShifts() {
    if (!selectedDate) return;
    const displayed = getDisplayedShiftsForDayDialog(selectedDate);
    if (displayed.length === 0) return;
    const displayedIds = displayed.map((s) => s.id);
    const allDisplayedSelected = displayedIds.every((id) => daySelectedShiftIds.has(id));

    setDaySelectedShiftIds((prev) => {
      const next = new Set(prev);
      if (allDisplayedSelected) {
        displayedIds.forEach((id) => next.delete(id));
      } else {
        displayedIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleDeleteSelectedDayShifts() {
    if (daySelectedShiftIds.size === 0) {
      notifyWarning('Nenhum plantão selecionado');
      return;
    }
    if (!confirm(`Deseja excluir ${daySelectedShiftIds.size} plantão(ões) selecionado(s)?`)) return;

    const ids = Array.from(daySelectedShiftIds);

    // Safety check (RPC + direct table fallback):
    // never delete shifts that currently have assigned plantonistas.
    const dayStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
    let assignedRows: Array<{ shift_id: string }> = [];
    let assignedCheckError: any = null;

    if (dayStr && currentTenantId) {
      try {
        const rangeRows = await fetchAdminAssignmentRange({
          tenantId: currentTenantId,
          start: dayStr,
          end: dayStr,
        });
        assignedRows = (rangeRows as any[]).map((row) => ({ shift_id: row.shift_id }));
      } catch (error) {
        assignedCheckError = error;
      }
    }

    // Fallback for safety if RPC is unavailable.
    if (assignedRows.length === 0) {
      try {
        const tableRows = await fetchAdminAssignmentsByShiftIds(ids);
        assignedRows = (tableRows || []) as Array<{ shift_id: string }>;
      } catch (tableError) {
        if (assignedCheckError) {
          notifyError(
            'validar exclusão',
            assignedCheckError,
            'Não foi possível validar os plantonistas antes de excluir.',
          );
          return;
        }
        notifyError('validar exclusão', tableError, 'Não foi possível validar os plantonistas antes de excluir.');
        return;
      }
      if (assignedRows.length === 0 && assignedCheckError) {
        notifyError(
          'validar exclusão',
          assignedCheckError,
          'Não foi possível validar os plantonistas antes de excluir.',
        );
        return;
      }
    }

    const protectedShiftIds = new Set((assignedRows || []).map((row: any) => row.shift_id));
    const deletableIds = ids.filter((id) => !protectedShiftIds.has(id));
    const protectedCount = protectedShiftIds.size;
    const hasProtected = protectedCount > 0;

    let idsToDelete = deletableIds;

    if (hasProtected) {
      const forceDelete = confirm(
        `${protectedCount} plantão(ões) selecionado(s) têm plantonista atribuído.\n\n` +
        'Deseja excluir mesmo assim? Esta ação removerá também essas atribuições.'
      );

      if (forceDelete) {
        idsToDelete = ids;
      } else if (deletableIds.length === 0) {
        notifyWarning(
          'Nenhum plantão excluído',
          'Você cancelou a exclusão dos plantões com plantonista.',
        );
        return;
      }
    }

    try {
      await deleteAdminShiftsByIds(idsToDelete);
    } catch (error) {
      notifyError('excluir plantões selecionados', error, 'Não foi possível excluir os plantões selecionados.');
      return;
    }

    if (hasProtected && idsToDelete.length !== ids.length) {
      notifyWarning(
        'Exclusão parcial',
        `${idsToDelete.length} removido(s). ${protectedCount} com plantonista foram preservados.`,
      );
    } else {
      notifySuccess('Plantões excluídos', `${idsToDelete.length} plantão(ões) removido(s).`);
    }

    setDaySelectedShiftIds(new Set());
    await fetchData();
  }

  function handleDeleteCurrentScale() {
    if (deletingCurrentScale) return;
    if (filterSector === 'all') {
      notifyWarning('Selecione um setor', 'Para excluir escala, selecione um setor específico.');
      return;
    }

    const sectorName = sectors.find((s) => s.id === filterSector)?.name || 'setor selecionado';
    const shiftsToDelete = [...filteredShifts];
    if (shiftsToDelete.length === 0) {
      notifyWarning('Nenhum plantão no período');
      return;
    }

    const periodLabel =
      viewMode === 'month'
        ? format(currentDate, 'MMMM/yyyy', { locale: ptBR })
        : `semana ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'dd/MM', { locale: ptBR })} a ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'dd/MM/yyyy', { locale: ptBR })}`;

    setDeleteScaleContext({
      sectorName,
      periodLabel,
      count: shiftsToDelete.length,
      ids: shiftsToDelete.map((s) => s.id),
    });
    setDeleteScaleConfirmText('');
    setDeleteScaleDialogOpen(true);
  }

  async function confirmDeleteCurrentScale() {
    if (deletingCurrentScale || !deleteScaleContext) return;
    if (deleteScaleConfirmText.trim().toUpperCase() !== 'EXCLUIR') {
      notifyWarning('Confirmação inválida', 'Digite EXCLUIR para confirmar.');
      return;
    }

    setDeletingCurrentScale(true);
    const ids = deleteScaleContext.ids;

    try {
      try {
        await deleteAdminShiftsByIds(ids);
      } catch (bulkError) {
        notifyError('excluir escala do período', bulkError, 'Não foi possível excluir a escala inteira.');
        return;
      }

      setSelectedShiftIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      notifySuccess('Escala excluída', `${ids.length} plantão(ões) removido(s).`);
      await fetchData();
      setDeleteScaleDialogOpen(false);
      setDeleteScaleConfirmText('');
      setDeleteScaleContext(null);
    } finally {
      setDeletingCurrentScale(false);
    }
  }

  async function handleReplicateDayShifts() {
    if (!currentTenantId || !selectedDate || !user?.id) return;

    const dayShifts = getShiftsForDayDialog(selectedDate);
    if (dayShifts.length === 0) {
      notifyWarning('Nenhum plantão para replicar');
      return;
    }

    setReplicateLoading(true);
    try {
      let createdShiftsCount = 0;
      let shiftErrorsCount = 0;
      let createdAssignmentsCount = 0;
      let assignmentErrorsCount = 0;
      let skippedAssignmentsCount = 0;

      for (let week = 1; week <= replicateWeeks; week++) {
        const targetDate = addWeeks(selectedDate, week);
        const targetDateStr = format(targetDate, 'yyyy-MM-dd');

        for (const sourceShift of dayShifts) {
          let newShiftId: string;
          try {
            newShiftId = await insertAdminShiftAndGetId({
              tenant_id: currentTenantId,
              title: sourceShift.title,
              hospital: sourceShift.hospital,
              location: sourceShift.location,
              shift_date: targetDateStr,
              start_time: sourceShift.start_time,
              end_time: sourceShift.end_time,
              base_value: sourceShift.base_value,
              notes: sourceShift.notes,
              sector_id: sourceShift.sector_id,
              updated_by: user.id,
            });
          } catch {
            shiftErrorsCount++;
            continue;
          }

          createdShiftsCount++;

          const sourceAssignments = assignments.filter((a) => a.shift_id === sourceShift.id);
          for (const assignment of sourceAssignments) {
            if (!isUserAllowedInSector(assignment.user_id, sourceShift.sector_id || null)) {
              skippedAssignmentsCount++;
              continue;
            }

            try {
              await cloneAdminAssignmentToShift({
                tenantId: currentTenantId,
                targetShiftId: newShiftId,
                sourceAssignment: assignment,
                updatedBy: user.id,
              });
              createdAssignmentsCount++;
            } catch {
              assignmentErrorsCount++;
            }
          }
        }
      }

      if (shiftErrorsCount > 0 || assignmentErrorsCount > 0) {
        notifyError(
          'replicar dia',
          `${shiftErrorsCount + assignmentErrorsCount} pendência(s)`,
          `Plantões: ${createdShiftsCount} criados (${shiftErrorsCount} erro(s)). Atribuições: ${createdAssignmentsCount} criadas (${assignmentErrorsCount} erro(s), ${skippedAssignmentsCount} ignorada(s)).`,
        );
      } else {
        notifySuccess('Dia replicado', `Criados ${createdShiftsCount} plantão(ões) nas próximas ${replicateWeeks} semana(s).`);
      }

      setReplicateDayDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      console.error('[ShiftCalendar] replicate day failed', error);
      notifyError('replicar dia', error, 'Ocorreu um erro ao replicar os plantões.');
    } finally {
      setReplicateLoading(false);
    }
  }

  async function replicateShiftToDate(
    sourceShift: Shift,
    targetDateStr: string,
  ): Promise<{
    shiftErrors: number;
    assignmentsErrors: number;
    skippedAssignments: number;
    assignmentsCreated: number;
    shiftsCreated: number;
  }> {
    const stats = {
      shiftErrors: 0,
      assignmentsErrors: 0,
      skippedAssignments: 0,
      assignmentsCreated: 0,
      shiftsCreated: 0,
    };

    if (!currentTenantId) {
      stats.shiftErrors = 1;
      return stats;
    }

    let newShiftId: string;
    try {
      newShiftId = await insertAdminShiftAndGetId({
        tenant_id: currentTenantId,
        title: sourceShift.title,
        hospital: sourceShift.hospital,
        location: sourceShift.location,
        shift_date: targetDateStr,
        start_time: sourceShift.start_time,
        end_time: sourceShift.end_time,
        base_value: sourceShift.base_value,
        notes: sourceShift.notes,
        sector_id: sourceShift.sector_id,
        updated_by: user?.id,
      });
    } catch (error) {
      stats.shiftErrors = 1;
      return stats;
    }

    stats.shiftsCreated = 1;

    const sourceAssignments = assignments.filter((a) => a.shift_id === sourceShift.id);
    for (const assignment of sourceAssignments) {
      if (!isUserAllowedInSector(assignment.user_id, sourceShift.sector_id || null)) {
        stats.skippedAssignments += 1;
        continue;
      }

      try {
        await cloneAdminAssignmentToShift({
          tenantId: currentTenantId,
          targetShiftId: newShiftId,
          sourceAssignment: assignment,
          updatedBy: user?.id,
        });
        stats.assignmentsCreated += 1;
      } catch {
        stats.assignmentsErrors += 1;
      }
    }

    return stats;
  }

  async function handleReplicateDayToTargetDate() {
    if (!currentTenantId || !selectedDate || !replicateCustomDayTargetDate) return;
    if (isSameDay(selectedDate, replicateCustomDayTargetDate)) {
      notifyWarning('Destino inválido', 'Selecione um dia diferente para replicar.');
      return;
    }

    const sourceShifts = getShiftsForDayDialog(selectedDate);
    if (sourceShifts.length === 0) {
      notifyWarning('Nenhum plantão para replicar', 'Selecione um dia com plantões.');
      return;
    }

    setReplicateCustomDayLoading(true);
    try {
      const targetDateStr = format(replicateCustomDayTargetDate, 'yyyy-MM-dd');
      const totalStats = {
        shifts: 0,
        shiftErrors: 0,
        assignments: 0,
        assignmentErrors: 0,
        skippedAssignments: 0,
      };

      for (const shift of sourceShifts) {
        const stats = await replicateShiftToDate(shift, targetDateStr);
        totalStats.shifts += stats.shiftsCreated;
        totalStats.shiftErrors += stats.shiftErrors;
        totalStats.assignments += stats.assignmentsCreated;
        totalStats.assignmentErrors += stats.assignmentsErrors;
        totalStats.skippedAssignments += stats.skippedAssignments;
      }

      if (totalStats.shiftErrors || totalStats.assignmentErrors) {
        notifyError(
          'replicar dia personalizado',
          `${totalStats.shiftErrors + totalStats.assignmentErrors} pendência(s)`,
          `Plantões: ${totalStats.shifts} criados (${totalStats.shiftErrors} erro(s)). Atribuições: ${totalStats.assignments} criadas (${totalStats.assignmentErrors} erro(s), ${totalStats.skippedAssignments} ignorada(s)).`,
        );
      } else {
        notifySuccess(
          'Dia replicado',
          `Criados ${totalStats.shifts} plantão(ões) em ${format(replicateCustomDayTargetDate, 'EEEE, dd/MM/yyyy', { locale: ptBR })}.`,
        );
      }

      setReplicateCustomDayDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      console.error('[ShiftCalendar] replicate custom day failed', error);
      notifyError('replicar dia personalizado', error, 'Ocorreu um erro ao replicar o dia selecionado.');
    } finally {
      setReplicateCustomDayLoading(false);
    }
  }

  async function handleReplicateWeekToWeek() {
    if (!currentTenantId || !replicateWeekSourceStart || !replicateWeekTargetStart) return;
    const sourceStart = startOfWeek(replicateWeekSourceStart, { weekStartsOn: 1 });
    const targetStart = startOfWeek(replicateWeekTargetStart, { weekStartsOn: 1 });
    if (isSameDay(sourceStart, targetStart)) {
      notifyWarning('Destino inválido', 'Selecione uma semana diferente para replicar.');
      return;
    }

    const interval = eachDayOfInterval({ start: sourceStart, end: addDays(sourceStart, 6) });
    const sourceShifts = shifts.filter((shift) =>
      interval.some((day) => isSameDay(parseISO(shift.shift_date), day)),
    );
    if (sourceShifts.length === 0) {
      notifyWarning('Nenhum plantão na semana', 'Selecione uma semana com plantões.');
      return;
    }

    setReplicateWeekLoading(true);
    try {
      const totalStats = {
        shifts: 0,
        shiftErrors: 0,
        assignments: 0,
        assignmentErrors: 0,
        skippedAssignments: 0,
      };

      for (const shift of sourceShifts) {
        const offset = differenceInCalendarDays(parseISO(shift.shift_date), sourceStart);
        const targetDate = addDays(targetStart, offset);
        const stats = await replicateShiftToDate(shift, format(targetDate, 'yyyy-MM-dd'));
        totalStats.shifts += stats.shiftsCreated;
        totalStats.shiftErrors += stats.shiftErrors;
        totalStats.assignments += stats.assignmentsCreated;
        totalStats.assignmentErrors += stats.assignmentsErrors;
        totalStats.skippedAssignments += stats.skippedAssignments;
      }

      if (totalStats.shiftErrors || totalStats.assignmentErrors) {
        notifyError(
          'replicar semana',
          `${totalStats.shiftErrors + totalStats.assignmentErrors} pendência(s)`,
          `Plantões: ${totalStats.shifts} criados (${totalStats.shiftErrors} erro(s)). Atribuições: ${totalStats.assignments} criadas (${totalStats.assignmentErrors} erro(s), ${totalStats.skippedAssignments} ignorada(s)).`,
        );
      } else {
        notifySuccess(
          'Semana replicada',
          `Semana iniciando em ${format(targetStart, 'dd/MM/yyyy')} copiada.`,
        );
      }

      setReplicateWeekDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      console.error('[ShiftCalendar] replicate week failed', error);
      notifyError('replicar semana', error, 'Não foi possível replicar a semana.');
    } finally {
      setReplicateWeekLoading(false);
    }
  }

  async function handleDeleteDaysRange() {
    if (!currentTenantId || !deleteDaysStart || !deleteDaysEnd) return;
    if (deleteDaysConfirmText.trim().toUpperCase() !== 'EXCLUIR') {
      notifyWarning('Confirmação necessária', 'Digite EXCLUIR para permitir a exclusão.');
      return;
    }
    const interval = eachDayOfInterval({ start: deleteDaysStart, end: deleteDaysEnd });
    const shiftIdsToDelete = shifts
      .filter((shift) =>
        interval.some((day) => isSameDay(parseISO(shift.shift_date), day)),
      )
      .map((shift) => shift.id);

    if (shiftIdsToDelete.length === 0) {
      notifyWarning('Nenhum plantão no período', 'Não há plantões cadastrados nas datas informadas.');
      return;
    }

    setDeletingDaysRange(true);
    try {
      await deleteAdminShiftsByIds(shiftIdsToDelete);
      notifySuccess('Dias excluídos', `${shiftIdsToDelete.length} plantão(ões) removido(s).`);
      setDeleteDaysDialogOpen(false);
      await fetchData();
    } catch (error) {
      notifyError('excluir dias', error, 'Não foi possível remover os plantões selecionados.');
    } finally {
      setDeletingDaysRange(false);
    }
  }

  function openDeleteDaysDialog() {
    const baseDate = selectedDate || currentDate;
    setDeleteDaysStart(baseDate);
    setDeleteDaysEnd(baseDate);
    setDeleteDaysConfirmText('');
    setDeleteDaysDialogOpen(true);
  }

  function openReplicateCustomDayDialog() {
    setReplicateCustomDayTargetDate(selectedDate ? addDays(selectedDate, 1) : null);
    setReplicateCustomDayDialogOpen(true);
  }

  function openReplicateWeekDialog() {
    setReplicateWeekSourceStart(startOfWeek(selectedDate || currentDate, { weekStartsOn: 1 }));
    setReplicateWeekTargetStart(null);
    setReplicateWeekDialogOpen(true);
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
      let monthShifts: Shift[] = [];
      try {
        monthShifts = (await fetchAdminShiftsInRange({
          tenantId: currentTenantId,
          start: format(sourceMonthStart, 'yyyy-MM-dd'),
          end: format(sourceMonthEnd, 'yyyy-MM-dd'),
        })) as Shift[];
      } catch (error) {
        notifyError('carregar plantões', error, 'Não foi possível carregar os plantões para cópia.');
        return;
      }
      const shiftsToProcess = filterSector === 'all' ? monthShifts : monthShifts.filter(s => s.sector_id === filterSector);

      if (shiftsToProcess.length === 0) {
        notifyWarning('Nenhum plantão para copiar', 'Este mês não tem plantões cadastrados para o filtro atual.');
        return;
      }

      // Fetch assignments for the source shifts we will copy
      const sourceShiftIds = shiftsToProcess.map(s => s.id);
      let sourceAssignments: ShiftAssignment[] = [];
      try {
        sourceAssignments = (await fetchAdminAssignmentsByShiftIds(sourceShiftIds)) as unknown as ShiftAssignment[];
      } catch (error) {
        notifyError('carregar atribuições', error, 'Não foi possível carregar as atribuições para cópia.');
        return;
      }
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
            let newShiftId: string;
            try {
              newShiftId = await insertAdminShiftAndGetId({
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
                updated_by: user?.id,
              });
            } catch {
              errorCount++;
              continue;
            }

            successCount++;

            const shiftAssignments = assignmentsByShiftId.get(shift.id) || [];
            for (const assignment of shiftAssignments) {
              try {
                await cloneAdminAssignmentToShift({
                  tenantId: currentTenantId,
                  targetShiftId: newShiftId,
                  sourceAssignment: assignment,
                  updatedBy: user?.id,
                });
              } catch {
                errorCount++;
              }
            }
          }
        }
      }

      let message = `${successCount} plantões copiados por dia da semana (1ª, 2ª, 3ª ocorrência...)`;
      if (skippedCount > 0) message += `. ${skippedCount} ignorado(s) (não existe essa ocorrência no mês destino)`;
      if (errorCount > 0) message += `. ${errorCount} erro(s)`;

      notifySuccess('Escala copiada', message);

      setCopyScheduleDialogOpen(false);
      setCopyTargetMonth(null);
      setCurrentDate(copyTargetMonth);
    } catch (error) {
      console.error('Error copying schedule:', error);
      notifyError('copiar escala', error, 'Não foi possível copiar a escala.');
    } finally {
      setCopyInProgress(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedShift || !currentTenantId) return;

    const raw = (assignData.assigned_value ?? '').toString().trim();
    // REGRA ÚNICA: o Financeiro não recalcula.
    // Portanto, ao atribuir um plantonista, precisamos PERSISTIR o valor final (já pró-rata) aqui.
    // - Se admin digitou um valor, tratamos como override explícito.
    // - Se ficou em branco, calculamos via regras (individual -> setor) e persistimos o resultado.
    const assignedValue = resolveValue({
      raw,
      sector_id: selectedShift.sector_id || null,
      start_time: selectedShift.start_time.slice(0, 5),
      end_time: selectedShift.end_time.slice(0, 5),
      user_id: assignData.user_id,
      useSectorDefault: raw.length === 0,
      applyProRata: true,
    });

    if (!isUserAllowedInSector(assignData.user_id, selectedShift.sector_id || null)) {
      notifyWarning('Plantonista inválido para o setor', 'Atribua somente plantonistas cadastrados no setor deste plantão.');
      return;
    }
    
    // Check if there's already an assignment (to determine if this is an add or update)
    const existingAssignment = assignments.find(a => a.shift_id === selectedShift.id && a.user_id === assignData.user_id);
    
    try {
      await upsertAdminAssignment({
        tenantId: currentTenantId,
        shiftId: selectedShift.id,
        userId: assignData.user_id,
        assignedValue,
        updatedBy: user?.id,
      });
    } catch (error: any) {
      if (error.code === '23505') {
        notifyWarning('Usuário já atribuído', 'Usuário já atribuído a este plantão.');
      } else {
        notifyError('atribuir plantonista', error, 'Não foi possível atribuir o plantonista.');
      }
      return;
    }

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
    notifySuccess('Atribuição de plantonista');
    fetchData();
    setAssignDialogOpen(false);
    setAssignData({ user_id: '', assigned_value: '' });
  }

  async function handleRemoveAssignment(assignmentId: string, shiftId?: string) {
    if (!confirm('Deseja remover este usuário do plantão?')) return;

    // Get assignment details before deleting for movement tracking
    const assignmentToRemove = assignments.find(a => a.id === assignmentId);
    const relatedShift = shiftId ? shifts.find(s => s.id === shiftId) : 
      (assignmentToRemove ? shifts.find(s => s.id === assignmentToRemove.shift_id) : null);
    
    try {
      await deleteAdminAssignment(assignmentId);
    } catch (error) {
      notifyError('remover plantonista', error, 'Não foi possível remover o plantonista do plantão.');
      return;
    }

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
    notifySuccess('Plantonista removido do plantão');
    fetchData();
  }

  async function handleTransferAssignment() {
    if (!currentTenantId || !user?.id || !transferAssignment || !transferSourceShift || !transferTargetShiftId) return;

    const targetShift = shifts.find((s) => s.id === transferTargetShiftId);
    if (!targetShift) {
      notifyWarning('Plantão de destino inválido');
      return;
    }

    const userId = transferAssignment.user_id;
    if (!isUserAllowedInSector(userId, transferSourceShift.sector_id || null)) {
      notifyWarning('Transferência bloqueada', 'O plantonista não pertence ao setor de origem.');
      return;
    }

    if (!isUserAllowedInSector(userId, targetShift.sector_id || null)) {
      notifyWarning('Transferência bloqueada', 'Só é permitido migrar para setores dos quais o plantonista faz parte.');
      return;
    }

    if (targetShift.sector_id === transferSourceShift.sector_id) {
      notifyWarning('Selecione outro setor', 'A migração deve ser para um plantão de outro setor.');
      return;
    }

    if (targetShift.shift_date !== transferSourceShift.shift_date) {
      notifyWarning('Transferência bloqueada', 'A transferência deve ocorrer no mesmo dia, apenas entre setores.');
      return;
    }

    if (assignments.some((a) => a.shift_id === targetShift.id && a.user_id === userId)) {
      notifyWarning('Plantonista já está no destino', 'Escolha outro plantão de destino.');
      return;
    }

    setTransferring(true);
    try {
      const assignedValueForTarget =
        transferAssignment.assigned_value !== null
          ? transferAssignment.assigned_value
          : resolveValue({
              raw: '',
              sector_id: targetShift.sector_id || null,
              start_time: targetShift.start_time,
              end_time: targetShift.end_time,
              user_id: userId,
              useSectorDefault: true,
              applyProRata: true,
            });

      const { insertedId } = await transferAdminAssignment({
        tenantId: currentTenantId,
        sourceAssignmentId: transferAssignment.id,
        targetShiftId: targetShift.id,
        userId,
        assignedValue: assignedValueForTarget,
        updatedBy: user.id,
      });

      const userName = getAssignmentName(transferAssignment);
      const shiftDate = parseISO(transferSourceShift.shift_date);
      await recordScheduleMovement({
        tenant_id: currentTenantId,
        month: shiftDate.getMonth() + 1,
        year: shiftDate.getFullYear(),
        user_id: userId,
        user_name: userName,
        movement_type: 'transferred',
        source_sector_id: transferSourceShift.sector_id || null,
        source_sector_name: getSectorName(transferSourceShift.sector_id, transferSourceShift.hospital),
        source_shift_date: transferSourceShift.shift_date,
        source_shift_time: `${transferSourceShift.start_time.slice(0, 5)}-${transferSourceShift.end_time.slice(0, 5)}`,
        source_assignment_id: transferAssignment.id,
        destination_sector_id: targetShift.sector_id || null,
        destination_sector_name: getSectorName(targetShift.sector_id, targetShift.hospital),
        destination_shift_date: targetShift.shift_date,
        destination_shift_time: `${targetShift.start_time.slice(0, 5)}-${targetShift.end_time.slice(0, 5)}`,
        destination_assignment_id: insertedId,
        reason: 'Transferência manual entre setores (admin)',
        performed_by: user.id,
      });

      notifySuccess('Transferência de plantonista');
      setTransferDialogOpen(false);
      setTransferAssignment(null);
      setTransferSourceShift(null);
      setTransferTargetSectorId('');
      setTransferTargetShiftId('');
      await fetchData();
    } catch (error: any) {
      notifyError('transferir plantonista', error, 'Falha ao transferir plantonista.');
    } finally {
      setTransferring(false);
    }
  }

  // Accept a pending offer and assign the plantonista to the shift
  async function handleAcceptOffer(offer: ShiftOffer, shift: Shift) {
    if (!currentTenantId || !user?.id) return;

    try {
      try {
        await upsertAdminAssignment({
          tenantId: currentTenantId,
          shiftId: offer.shift_id,
          userId: offer.user_id,
          assignedValue: null,
          updatedBy: user.id,
        });
      } catch (assignError) {
        notifyError('aceitar oferta', assignError, 'Não foi possível aceitar a oferta.');
        return;
      }

      await acceptAdminShiftOffer({
        offerId: offer.id,
        shiftId: offer.shift_id,
        reviewerId: user.id,
      });

      // Remove [DISPONÍVEL] from shift notes
      const updatedNotes = stripShiftStatusTags(shift.notes);
      await updateAdminShiftById(shift.id, {
        notes: updatedNotes || null,
        updated_by: user.id,
      });

      notifySuccess('Oferta aceita', `${getOfferName(offer)} foi atribuído ao plantão.`);
      fetchData();
    } catch (error) {
      console.error('Error accepting offer:', error);
      notifyError('aceitar oferta', error, 'Não foi possível aceitar a oferta.');
    }
  }

  async function handleRejectOffer(offerId: string) {
    if (!user?.id) return;

    try {
      await rejectAdminShiftOffer({
        offerId,
        reviewerId: user.id,
      });
    } catch (error) {
      notifyError('rejeitar oferta', error, 'Não foi possível rejeitar a oferta.');
      return;
    }

    notifySuccess('Oferta rejeitada');
    fetchData();
  }

  const [recalculateLoading, setRecalculateLoading] = useState(false);

  // Recalculate all assigned_values for the current month using current individual/sector values
  async function handleRecalculateValues() {
    if (!currentTenantId || !user?.id) return;
    
    if (filterSector === 'all') {
      notifyWarning('Selecione um setor', 'Para recalcular, primeiro selecione um setor específico.');
      return;
    }

    if (!confirm('Isso irá recalcular TODOS os valores do mês com base nos valores individuais/setor atuais. Valores digitados manualmente serão substituídos. Deseja continuar?')) {
      return;
    }

    setRecalculateLoading(true);
    try {
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      
      // Get all shifts for the current month and sector
      const monthStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');
      
      const shiftsInMonth = shifts.filter(s => 
        s.sector_id === filterSector &&
        s.shift_date >= monthStart &&
        s.shift_date <= monthEnd
      );

      if (shiftsInMonth.length === 0) {
        notifyInfo('Nenhum plantão encontrado', 'Não há plantões para recalcular neste setor/mês.');
        setRecalculateLoading(false);
        return;
      }

      // Get assignments for these shifts
      const shiftIds = shiftsInMonth.map(s => s.id);
      const assignmentsToUpdate = assignments.filter(a => shiftIds.includes(a.shift_id));

      if (assignmentsToUpdate.length === 0) {
        notifyInfo('Nenhuma atribuição encontrada', 'Não há plantonistas atribuídos para recalcular.');
        setRecalculateLoading(false);
        return;
      }

      // IMPORTANTE: Buscar valores individuais FRESCOS do banco (não usar cache)
      const { data: freshUserValues } = await supabase
        .from('user_sector_values')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .eq('sector_id', filterSector)
        .eq('month', currentMonth)
        .eq('year', currentYear);
      
      const freshValuesMap = new Map<string, { day_value: number | null; night_value: number | null }>();
      (freshUserValues ?? []).forEach((uv: any) => {
        freshValuesMap.set(uv.user_id, { day_value: uv.day_value, night_value: uv.night_value });
      });

      console.log('Fresh user values loaded:', { 
        count: freshValuesMap.size, 
        keys: Array.from(freshValuesMap.keys()).map(k => k.slice(0, 8)),
        values: Array.from(freshValuesMap.entries()).map(([k, v]) => ({ user: k.slice(0, 8), ...v }))
      });

      // Get sector info
      const sector = sectors.find(s => s.id === filterSector);
      
      let updatedCount = 0;
      let skippedCount = 0;
      const debugInfo: string[] = [];
      
      for (const assignment of assignmentsToUpdate) {
        const shift = shiftsInMonth.find(s => s.id === assignment.shift_id);
        if (!shift) {
          skippedCount++;
          continue;
        }

        // IMPORTANT:
        // To guarantee that individual overrides (including 0) are respected,
        // we CLEAR assigned_value instead of writing a computed number.
        // The UI/Finance will then derive the value from individual/sector rules.
        // This also fixes legacy data where assigned_value was previously set to sector defaults.
        const isNight = isNightShift(shift.start_time, shift.end_time);
        const userValueEntry = freshValuesMap.get(assignment.user_id);
        const userValue = userValueEntry ? (isNight ? userValueEntry.night_value : userValueEntry.day_value) : null;
        const source = userValueEntry ? (userValue === 0 ? 'individual-zero' : 'individual-or-blank') : 'sector-default';

        debugInfo.push(`${assignment.user_id.slice(0, 8)}: ${source} -> assigned_value = null`);

        // Update the assignment
        try {
          await updateAdminAssignmentValue({
            assignmentId: assignment.id,
            assignedValue: null,
            updatedBy: user.id,
          });
          updatedCount++;
        } catch (error) {
          console.error('Error updating assignment:', assignment.id, error);
        }
      }

      console.log('Recalculate debug:', { 
        freshValuesMapSize: freshValuesMap.size,
        assignmentsToUpdate: assignmentsToUpdate.length,
        updatedCount,
        skippedCount,
        debugInfo: debugInfo.slice(0, 10)
      });

      notifySuccess(
        'Valores recalculados',
        `${updatedCount} de ${assignmentsToUpdate.length} atribuições atualizadas (assigned_value limpo para usar valores individuais/padrão).`,
      );
      
      fetchData();
    } catch (error) {
      console.error('Error recalculating values:', error);
      notifyError('recalcular valores', error, 'Não foi possível recalcular os valores.');
    } finally {
      setRecalculateLoading(false);
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
      day_quantity: 1,
      night_quantity: 0,
      use_sector_default: true,
    });
    setMultiShifts([]);
    setShiftDialogOpen(true);
  }

  function buildRowsByShiftType(dayCount: number, nightCount: number): MultiShiftData[] {
    const normalizedDay = Math.max(0, Math.min(20, dayCount));
    const normalizedNight = Math.max(0, Math.min(20, nightCount));
    const rows: MultiShiftData[] = [];

    for (let i = 0; i < normalizedDay; i += 1) {
      rows.push({ user_id: 'vago', start_time: '07:00', end_time: '19:00' });
    }
    for (let i = 0; i < normalizedNight; i += 1) {
      rows.push({ user_id: 'vago', start_time: '19:00', end_time: '07:00' });
    }

    return rows;
  }

  function updateShiftTypeCounts(nextDayRaw: number, nextNightRaw: number) {
    const nextDay = Math.max(0, Math.min(20, nextDayRaw));
    const nextNight = Math.max(0, Math.min(20, nextNightRaw));
    const total = Math.max(1, Math.min(20, nextDay + nextNight));
    const rows = buildRowsByShiftType(nextDay, nextNight);

    setFormData((prev) => ({
      ...prev,
      day_quantity: nextDay,
      night_quantity: nextNight,
      quantity: total,
      // When there is exactly one row by type, keep the main time inputs in sync
      // so "Noturno" uses 19:00-07:00 and "Diurno" uses 07:00-19:00.
      start_time: rows.length === 1 ? rows[0].start_time : prev.start_time,
      end_time: rows.length === 1 ? rows[0].end_time : prev.end_time,
    }));

    setMultiShifts(rows.length > 1 ? rows : []);
  }

  function openDayView(date: Date, sectorId?: string, focusedShiftId?: string | null) {
    if (dayDialogCloseGuardRef.current) return;
    setSelectedDate(date);
    setDayDialogSectorId(sectorId || null);
    setDayDialogFocusedShiftId(focusedShiftId || null);
    setDaySelectedShiftIds(new Set());
    setDayDialogOpen(true);
    void refreshAssignmentsForDate(date);
  }

  function closeDayDialog() {
    dayDialogCloseGuardRef.current = true;

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
      dayDialogCloseGuardRef.current = false;
    }, 800);

    setDayDialogOpen(false);
    setDayDialogSectorId(null);
    setDayDialogFocusedShiftId(null);
    setDaySelectedShiftIds(new Set());
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
      day_quantity: 1,
      night_quantity: 0,
      // IMPORTANT: if the admin clears/zeros the value, apply sector default by default.
      // They can still uncheck if they want to keep it blank (null).
      use_sector_default: true,
    });
    setShiftDialogOpen(true);
  }

  function openQuickValueEdit(shift: Shift) {
    setFocusBaseValueOnEdit(true);
    openEditShift(shift);
  }

  function openSectorValuesFromCalendar() {
    if (filterSector === 'all') {
      notifyWarning('Selecione um setor', 'Escolha um setor específico para configurar valores.');
      return;
    }
    const sector = sectors.find((s) => s.id === filterSector) || null;
    if (!sector) {
      notifyWarning('Setor não encontrado', 'Não foi possível localizar o setor selecionado.');
      return;
    }
    setSelectedSectorForValues(sector);
    setValuesDialogOpen(true);
  }

  function openUserValuesFromCalendar() {
    if (filterSector === 'all') {
      notifyWarning('Selecione um setor', 'Escolha um setor específico para configurar valores individuais.');
      return;
    }
    const sector = sectors.find((s) => s.id === filterSector) || null;
    if (!sector) {
      notifyWarning('Setor não encontrado', 'Não foi possível localizar o setor selecionado.');
      return;
    }
    setSelectedSectorForUserValues(sector);
    setUserValuesDialogOpen(true);
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
    setFocusBaseValueOnEdit(false);
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
      day_quantity: 1,
      night_quantity: 0,
      use_sector_default: true,
    });
  }

  useEffect(() => {
    if (!shiftDialogOpen || !focusBaseValueOnEdit) return;
    const timeoutId = window.setTimeout(() => {
      const baseValueInput = document.getElementById('base_value') as HTMLInputElement | null;
      if (!baseValueInput) return;
      baseValueInput.focus();
      baseValueInput.select();
    }, 80);
    return () => window.clearTimeout(timeoutId);
  }, [shiftDialogOpen, focusBaseValueOnEdit, editingShift?.id]);

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
    setBulkEditData(createBulkEditDrafts(dayShifts, formatMoneyInput));
    setBulkEditDialogOpen(true);
  }
  async function handleBulkApplySave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id || !currentTenantId) return;

    if (!hasBulkApplyChanges(bulkApplyData)) {
      notifyWarning('Nada para aplicar', 'Preencha ao menos um campo para aplicar aos selecionados.');
      return;
    }

    const shiftIds = bulkApplyShiftIds;
    if (shiftIds.length === 0) return;

    try {
      const hasRawValue = !!bulkApplyData.base_value.trim();
      const { selected: selectedBulkShifts, byId: selectedBulkShiftMap } = collectBulkApplyTargetShifts(shiftIds, shifts);

      const shiftUpdate = buildBulkShiftUpdatePayload(bulkApplyData, user.id);
      const needsShiftUpdate = Object.keys(shiftUpdate).length > 1;

      if (needsShiftUpdate && !hasRawValue) {
        // When there's no value to calculate, we can safely update in bulk.
        await updateAdminShiftsByIds(shiftIds, shiftUpdate);
      }

      if (hasRawValue) {
        // Value needs pro-rata calculation per shift (6h/12h/24h), so update per-row.
        await Promise.all(
          shiftIds.map(async (shiftId) => {
            const s = selectedBulkShiftMap.get(shiftId);
            if (!s) return;

            const { start_time, end_time } = getBulkApplyEffectiveTimes(bulkApplyData, s);

            const base_value = resolveValue({
              raw: bulkApplyData.base_value,
              sector_id: s.sector_id || null,
              start_time,
              end_time,
              useSectorDefault: false,
              applyProRata: true,
            });

            const payload: any = {
              ...shiftUpdate,
              base_value,
            };

            await updateAdminShiftById(shiftId, payload);
          })
        );
      }

        // Assignment (plantonista) update
      if (bulkApplyData.assigned_user_id) {
        if (bulkApplyData.assigned_user_id === '__clear__') {
          await deleteAdminAssignmentsByShiftIds(shiftIds);
        } else {
          const invalidShift = findInvalidBulkAssigneeShift(
            selectedBulkShifts,
            bulkApplyData.assigned_user_id,
            isUserAllowedInSector,
          );

          if (invalidShift) {
            throw new Error('Selecione um plantonista que pertença ao setor de todos os plantões selecionados.');
          }

          await Promise.all(
            shiftIds.map(async (shiftId) => {
              const s = selectedBulkShiftMap.get(shiftId);
              if (!s) return;

              const { start_time, end_time } = getBulkApplyEffectiveTimes(bulkApplyData, s);

              // To avoid unique constraint issues (shift_id,user_id), treat bulk-apply assignee as a replace:
              // 1) remove existing assignees for the shift
              // 2) upsert the chosen assignee
              const shouldSetValue = !!bulkApplyData.base_value.trim();
              const valueToApplyFinal = shouldSetValue
                ? resolveValue({
                    raw: bulkApplyData.base_value,
                    sector_id: s.sector_id || null,
                    start_time,
                    end_time,
                    user_id: bulkApplyData.assigned_user_id,
                    useSectorDefault: false,
                    applyProRata: true,
                  })
                : undefined;

              await deleteAdminAssignmentsByShiftIds([shiftId]);
              await upsertAdminAssignment({
                tenantId: currentTenantId,
                shiftId,
                userId: bulkApplyData.assigned_user_id,
                assignedValue: valueToApplyFinal ?? null,
                updatedBy: user.id,
              });
            })
          );
        }
      }

      notifySuccess('Edição em bloco', `${shiftIds.length} plantão(ões) atualizados.`);
      setBulkApplyDialogOpen(false);
      setBulkApplyShiftIds([]);
      setBulkApplyData({ title: '', start_time: '', end_time: '', base_value: '', assigned_user_id: '' });
      setSelectedShiftIds(new Set());
      setDayDialogOpen(false);
      setDayDialogSectorId(null);
      fetchData();
    } catch (error: any) {
      console.error('Error applying bulk edits:', error);
      notifyError('aplicar edição em bloco', error, 'Ocorreu um erro ao aplicar as alterações.');
    }
  }

  async function applyBulkEditAssignment(params: {
    editData: BulkEditShiftData;
    originalShift: Shift;
    assignmentChoice: string;
    assignmentMode: ReturnType<typeof getBulkEditAssignmentMode>;
  }) {
    const { editData, originalShift, assignmentChoice, assignmentMode } = params;
    const currentAssignment = assignments.find((a) => a.shift_id === editData.id);

    if (assignmentMode === 'keep') return;

    if (assignmentMode === 'user') {
      const assignedValue = resolveValue({
        raw: editData.base_value,
        sector_id: editData.sector_id || null,
        start_time: editData.start_time,
        end_time: editData.end_time,
        user_id: assignmentChoice,
        useSectorDefault: false,
        applyProRata: true,
      });

      if (currentAssignment) {
        if (currentAssignment.user_id === assignmentChoice) {
          await updateAdminAssignmentValue({
            assignmentId: currentAssignment.id,
            assignedValue,
            updatedBy: user!.id,
          });
        } else {
          const oldUserName = getAssignmentName(currentAssignment);
          const newUserMember = members.find((m) => m.user_id === assignmentChoice);
          const newUserName = newUserMember?.profile?.name || 'Desconhecido';
          const sourceSectorName = getSectorName(originalShift.sector_id, originalShift.hospital);

          await upsertAdminAssignment({
            tenantId: currentTenantId!,
            shiftId: editData.id,
            userId: assignmentChoice,
            assignedValue,
            updatedBy: user!.id,
          });

          await deleteAdminAssignment(currentAssignment.id);

          await recordScheduleMovement(
            buildBulkEditRemovedMovement({
              tenantId: currentTenantId!,
              userId: currentAssignment.user_id,
              userName: oldUserName,
              assignmentId: currentAssignment.id,
              performedBy: user!.id,
              source: originalShift,
              sourceSectorName,
              reason: `Substituído por ${newUserName}`,
            }),
          );

          await recordScheduleMovement(
            buildBulkEditAddedMovement({
              tenantId: currentTenantId!,
              userId: assignmentChoice,
              userName: newUserName,
              performedBy: user!.id,
              destination: originalShift,
              destinationSectorName: sourceSectorName,
              reason: `Substituiu ${oldUserName}`,
            }),
          );
        }
      } else {
        const newUserMember = members.find((m) => m.user_id === assignmentChoice);

        await upsertAdminAssignment({
          tenantId: currentTenantId!,
          shiftId: editData.id,
          userId: assignmentChoice,
          assignedValue,
          updatedBy: user!.id,
        });

        await recordScheduleMovement(
          buildBulkEditAddedMovement({
            tenantId: currentTenantId!,
            userId: assignmentChoice,
            userName: newUserMember?.profile?.name || 'Desconhecido',
            performedBy: user!.id,
            destination: originalShift,
            destinationSectorName: getSectorName(originalShift.sector_id, originalShift.hospital),
          }),
        );
      }

      const cleanedNotes = stripShiftStatusTags(editData.notes);
      await updateAdminShiftById(editData.id, { notes: cleanedNotes || null });
      return;
    }

    if (currentAssignment) {
      await recordScheduleMovement(
        buildBulkEditRemovedMovement({
          tenantId: currentTenantId!,
          userId: currentAssignment.user_id,
          userName: getAssignmentName(currentAssignment),
          assignmentId: currentAssignment.id,
          performedBy: user!.id,
          source: originalShift,
          sourceSectorName: getSectorName(originalShift.sector_id, originalShift.hospital),
        }),
      );

      await deleteAdminAssignment(currentAssignment.id);
    }

    const statusChoice = assignmentMode === 'available' ? 'disponivel' : 'vago';
    const newNotes = buildBulkEditStatusNotes(stripShiftStatusTags(editData.notes), statusChoice);
    await updateAdminShiftById(editData.id, { notes: newNotes || null });
  }

  async function handleBulkEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id || !currentTenantId || bulkEditSaving) return;

    setBulkEditSaving(true);
    try {
      let updatedCount = 0;
      let errorCount = 0;

      for (const editData of bulkEditData) {
        const originalShift = bulkEditShifts.find(s => s.id === editData.id);
        if (!originalShift) continue;
        const assignmentChoice = normalizeBulkEditAssignmentChoice(editData.assigned_user_id);
        const assignmentMode = getBulkEditAssignmentMode(assignmentChoice);

        if (
          assignmentMode === 'user' &&
          !isUserAllowedInSector(assignmentChoice, editData.sector_id || null)
        ) {
          notifyWarning(
            'Plantonista inválido para o setor',
            'No modo "Editar todos", selecione apenas plantonistas do setor.',
          );
          errorCount++;
          continue;
        }

        // Update the shift
        try {
          const resolvedBaseValue = resolveValue({
              raw: editData.base_value,
              sector_id: editData.sector_id || null,
              start_time: editData.start_time,
              end_time: editData.end_time,
              useSectorDefault: false,
              applyProRata: true,
            });

          await updateAdminShiftById(
            editData.id,
            buildBulkEditShiftPayload({
              data: editData,
              updatedBy: user.id,
              title: generateShiftTitle(editData.start_time, editData.end_time),
              resolvedBaseValue,
            }),
          );
        } catch (shiftError) {
          console.error('Error updating shift:', shiftError);
          errorCount++;
          continue;
        }

        // Handle assignment changes
        try {
          await applyBulkEditAssignment({
            editData,
            originalShift,
            assignmentChoice,
            assignmentMode,
          });
        } catch (assignmentError: any) {
          const errorMessage = formatSupabaseError(assignmentError);
          console.error('[ShiftCalendar] bulk edit assignment failed:', assignmentError, errorMessage);
          notifyError('salvar plantão', assignmentError, errorMessage || 'Falha ao atualizar o plantonista.');
          errorCount++;
          continue;
        }

        updatedCount++;
      }

      if (updatedCount > 0) {
        notifySuccess(
          'Plantões atualizados',
          errorCount > 0
            ? `${updatedCount} salvo(s) e ${errorCount} com pendência. Você pode continuar editando.`
            : `${updatedCount} plantão(ões) salvos. Você pode continuar editando.`
        );
      } else if (errorCount > 0) {
        notifyWarning('Nenhum plantão salvo', 'Revise os campos e tente novamente.');
      }

      await fetchData();
      if (selectedDate) {
        openBulkEditDialog(selectedDate, dayDialogSectorId);
      }
    } catch (error) {
      console.error('Error saving bulk edits:', error);
      notifyError('salvar plantões', error, 'Ocorreu um erro ao salvar os plantões.');
    } finally {
      setBulkEditSaving(false);
    }
  }

  function openAssignDialog(shift: Shift) {
    setSelectedShift(shift);
    setAssignData({ user_id: '', assigned_value: shift.base_value?.toString() ?? '' });
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
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(day => (
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
            
            return (
              <div
                key={day.toISOString()}
                className={`${viewMode === 'week' ? 'min-h-[200px]' : 'min-h-[120px]'} p-1 border rounded-xl cursor-pointer transition-colors
                  ${isToday(day) ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'}
                `}
                onClick={() => {
                  // Click on the day container opens all shifts for that day.
                  openDayView(day, options?.sectorContextId, null);
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
                </div>
                
                {hasShifts && (
                  <div className={`space-y-1 overflow-y-auto pr-0.5 ${viewMode === 'week' ? 'max-h-[220px]' : 'max-h-[140px]'}`}>
                    {sortShiftsByTimeAndName(dayShifts).map(shift => {
                      const shiftAssignments = getAssignmentsForShift(shift.id);
                      const shiftPendingOffers = getOffersForShift(shift.id);
                      const sectorColor = getSectorColor(shift.sector_id, shift.hospital);
                      const sectorName = getSectorName(shift.sector_id, shift.hospital);
                      const isNight = isNightShift(shift.start_time, shift.end_time);
                      const isAvailable = isShiftAvailable(shift);
                      const showSectorName = !options?.hideSectorName && filterSector === 'all';
                      // Determine what to show for each shift:
                      // - If has assignments: show assigned plantonistas
                      // - If available and has offers: show "DISPONÍVEL" + offer names
                      // - If available and no offers: show "DISPONÍVEL"
                      // - Otherwise: show "VAGO"
                      
                      return (
                        <div
                          key={shift.id}
                          className={`text-xs p-1.5 rounded ${isNight ? 'ring-1 ring-indigo-400/30' : ''}`}
                          style={{ 
                            backgroundColor: isNight ? '#e0e7ff' : `${sectorColor}20`,
                            borderLeft: `3px solid ${isNight ? '#6366f1' : sectorColor}`
                          }}
                          title={`${shift.title} - ${sectorName} ${isNight ? '(Noturno)' : '(Diurno)'}`}
                          onClick={(e) => {
                            // Click on the shift card opens only this shift in day dialog.
                            e.stopPropagation();
                            openDayView(day, options?.sectorContextId, shift.id);
                          }}
                        >
                          <div className="mb-1 flex items-center justify-between gap-1">
                            <button
                              type="button"
                              className="rounded border border-border/70 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-background"
                              onClick={(e) => {
                                e.stopPropagation();
                                openQuickValueEdit(shift);
                              }}
                            >
                              Ajustar valor
                            </button>
                            <span className="text-[10px] font-semibold text-foreground">
                              R$ {(getShiftDisplayValue(shift) ?? 0).toFixed(2)}
                            </span>
                          </div>
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
                                      ✋ {getOfferName(offer)}
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
      notifyError('abrir impressão', 'janela bloqueada', 'Não foi possível abrir a janela de impressão.');
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
    const firstDayOfWeek = (monthStart.getDay() + 6) % 7;

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
          <div class="weekday">Seg</div>
          <div class="weekday">Ter</div>
          <div class="weekday">Qua</div>
          <div class="weekday">Qui</div>
          <div class="weekday">Sex</div>
          <div class="weekday">Sáb</div>
          <div class="weekday">Dom</div>
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

  function handleDownloadScheduleCSV() {
    const periodLabel = viewMode === 'month'
      ? format(currentDate, 'MM-yyyy', { locale: ptBR })
      : `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'dd-MM-yyyy')}_a_${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'dd-MM-yyyy')}`;
    const sectorName = filterSector === 'all'
      ? 'todos-os-setores'
      : (sectors.find((s) => s.id === filterSector)?.name || 'setor').replace(/\s+/g, '-').toLowerCase();

    const headers = [
      'Data',
      'Setor',
      'Inicio',
      'Fim',
      'Plantonistas',
      'Status',
      'Valor base',
      'Valor atribuido',
      'Observacoes',
    ];

    const rows = filteredShifts
      .slice()
      .sort((a, b) => {
        if (a.shift_date !== b.shift_date) return a.shift_date.localeCompare(b.shift_date);
        return a.start_time.localeCompare(b.start_time);
      })
      .map((shift) => {
        const shiftAssignments = getAssignmentsForShift(shift.id);
        const names = shiftAssignments.map((a) => getAssignmentName(a)).join(' | ') || '-';
        const assignedValue = shiftAssignments.length > 0
          ? shiftAssignments
              .map((a) => (a.assigned_value != null ? Number(a.assigned_value) : null))
              .filter((v): v is number => v != null)
              .map((v) => v.toFixed(2))
              .join(' | ')
          : '-';

        const status = shiftAssignments.length > 0
          ? 'Preenchido'
          : shift.notes?.includes('[DISPONÍVEL]')
            ? 'Disponivel'
            : 'Vago';

        const normalize = (value: string) => `"${value.replace(/"/g, '""')}"`;

        return [
          normalize(format(parseISO(shift.shift_date), 'dd/MM/yyyy', { locale: ptBR })),
          normalize(getSectorName(shift.sector_id, shift.hospital)),
          normalize(shift.start_time.slice(0, 5)),
          normalize(shift.end_time.slice(0, 5)),
          normalize(names),
          normalize(status),
          normalize(shift.base_value != null ? Number(shift.base_value).toFixed(2) : '-'),
          normalize(assignedValue),
          normalize(shift.notes || ''),
        ].join(';');
      });

    const csv = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `escala-${sectorName}-${periodLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleDownloadSchedulePDF() {
    handlePrintSchedule();
    notifyInfo('Exportar PDF', 'Na janela que abriu, escolha "Salvar como PDF".');
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

  function buildConflictKey(userId: string, date: string, conflictShifts: ShiftConflict['shifts']): string {
    const assignmentIds = conflictShifts
      .map((shift) => shift.assignmentId)
      .filter(Boolean)
      .sort();

    if (assignmentIds.length > 1) {
      return `${userId}_${date}_${assignmentIds.join('|')}`;
    }

    return `${userId}_${date}`;
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
          userName: getAssignmentName(assignment),
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
            id: buildConflictKey(data.userId, data.date, overlappingShifts),
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

  function getConflictUniqueSectorCount(conflict: ShiftConflict): number {
    return new Set(conflict.shifts.map((shift) => shift.sectorName)).size;
  }

  function getConflictUniqueTimeRangeCount(conflict: ShiftConflict): number {
    return new Set(
      conflict.shifts.map((shift) => `${shift.startTime.slice(0, 5)}-${shift.endTime.slice(0, 5)}`)
    ).size;
  }

  function getConflictSummaryLabel(conflict: ShiftConflict): string {
    const sectorCount = getConflictUniqueSectorCount(conflict);
    const rangeCount = getConflictUniqueTimeRangeCount(conflict);

    if (rangeCount > 1) {
      return `Conflitos em ${sectorCount} ${sectorCount === 1 ? 'local' : 'locais'}, em ${rangeCount} faixas de horário:`;
    }

    return `Conflito em ${sectorCount} ${sectorCount === 1 ? 'local' : 'locais'} no mesmo horário:`;
  }

  // Open justification dialog instead of immediate acknowledge
  function handleAcknowledgeConflict(conflict: ShiftConflict) {
    setPendingAcknowledgeConflict(conflict);
    setJustificationText('');
    setJustificationDialogOpen(true);
  }

  // Confirm acknowledge with justification
  async function confirmAcknowledgeConflict() {
    if (!pendingAcknowledgeConflict || !justificationText.trim() || !currentTenantId || !user?.id) {
      notifyWarning('Informe a justificativa');
      return;
    }

    const [resolvedById, plantonistaProfileId] = await Promise.all([
      resolveAdminProfileId(user.id),
      resolveAdminProfileId(pendingAcknowledgeConflict.userId),
    ]);

    try {
      await createAdminConflictResolution({
        tenant_id: currentTenantId,
        conflict_date: pendingAcknowledgeConflict.date,
        plantonista_id: plantonistaProfileId,
        plantonista_name: pendingAcknowledgeConflict.userName,
        resolution_type: 'acknowledged',
        justification: justificationText.trim(),
        conflict_details: pendingAcknowledgeConflict.shifts,
        resolved_by: resolvedById,
      });
    } catch (error) {
      notifyError('salvar resolução de conflito', error, 'Não foi possível salvar a resolução.');
      return;
    }

    setAcknowledgedConflicts(prev => new Set([...prev, pendingAcknowledgeConflict.id]));
    setJustificationDialogOpen(false);
    setPendingAcknowledgeConflict(null);
    setJustificationText('');
    notifySuccess('Conflito reconhecido', 'O conflito foi registrado com a justificativa informada.');
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
    const [resolvedById, plantonistaProfileId] = await Promise.all([
      resolveAdminProfileId(user.id),
      resolveAdminProfileId(conflict.userId),
    ]);

    // Delete the assignment
    try {
      await deleteAdminAssignment(assignmentToRemove.assignmentId);
    } catch (deleteError) {
      notifyError('remover atribuição', deleteError, 'Não foi possível remover a atribuição.');
      return;
    }

    let historySaved = true;
    try {
      await createAdminConflictResolution({
        tenant_id: currentTenantId,
        conflict_date: conflict.date,
        plantonista_id: plantonistaProfileId,
        plantonista_name: conflict.userName,
        resolution_type: 'removed',
        removed_sector_name: assignmentToRemove.sectorName,
        removed_shift_time: `${assignmentToRemove.startTime.slice(0,5)} - ${assignmentToRemove.endTime.slice(0,5)}`,
        removed_assignment_id: assignmentToRemove.assignmentId,
        kept_sector_name: assignmentToKeep.sectorName,
        kept_shift_time: `${assignmentToKeep.startTime.slice(0,5)} - ${assignmentToKeep.endTime.slice(0,5)}`,
        kept_assignment_id: assignmentToKeep.assignmentId,
        conflict_details: conflict.shifts,
        resolved_by: resolvedById,
      });
    } catch (insertError) {
      historySaved = false;
      console.error('Erro ao registrar resolução:', insertError);
    }

    setRemoveConfirmDialogOpen(false);
    setPendingRemoval(null);
    if (historySaved) {
      notifySuccess('Atribuição removida', 'O conflito foi resolvido e registrado no histórico.');
    } else {
      notifyWarning(
        'Atribuição removida, mas histórico não salvo',
        'A remoção foi concluída, porém o registro da resolução falhou. Tente novamente e verifique os vínculos do usuário.',
      );
    }
    fetchData();
  }

  // Fetch conflict resolution history
  async function fetchConflictHistory() {
    if (!currentTenantId) return;
    setLoadingHistory(true);

    try {
      const data = await fetchAdminConflictHistory(currentTenantId);
      setConflictHistory(data || []);
    } catch (error) {
      notifyError('carregar histórico', error, 'Não foi possível carregar o histórico de conflitos.');
    }
    setLoadingHistory(false);
  }

  function openConflictHistory() {
    setSelectedConflictHistoryIds(new Set());
    fetchConflictHistory();
    setConflictHistoryDialogOpen(true);
  }

  function toggleConflictHistorySelection(resolutionId: string, checked: boolean) {
    setSelectedConflictHistoryIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(resolutionId);
      else next.delete(resolutionId);
      return next;
    });
  }

  function toggleSelectAllConflictHistory(checked: boolean) {
    if (!checked) {
      setSelectedConflictHistoryIds(new Set());
      return;
    }
    setSelectedConflictHistoryIds(new Set(conflictHistory.map((item) => item.id)));
  }

  async function deleteSelectedConflictHistory() {
    if (!currentTenantId || selectedConflictHistoryIds.size === 0 || deletingConflictHistory) return;

    const ids = Array.from(selectedConflictHistoryIds);
    if (!confirm(`Deseja excluir ${ids.length} evento(s) do histórico de conflitos?`)) return;

    setDeletingConflictHistory(true);
    try {
      await deleteAdminConflictHistoryByIds({
        tenantId: currentTenantId,
        ids,
      });
    } catch (error) {
      notifyError('excluir histórico', error, 'Não foi possível excluir os eventos selecionados.');
      setDeletingConflictHistory(false);
      return;
    }

    notifySuccess('Histórico atualizado', `${ids.length} evento(s) excluído(s).`);
    setSelectedConflictHistoryIds(new Set());
    await fetchConflictHistory();
    setDeletingConflictHistory(false);
  }

  async function deleteAllConflictHistory() {
    if (!currentTenantId || conflictHistory.length === 0 || deletingConflictHistory) return;

    if (!confirm(`Deseja excluir TODO o histórico de conflitos (${conflictHistory.length} evento(s))?`)) return;

    setDeletingConflictHistory(true);
    try {
      await deleteAllAdminConflictHistory(currentTenantId);
    } catch (error) {
      notifyError('limpar histórico', error, 'Não foi possível limpar o histórico.');
      setDeletingConflictHistory(false);
      return;
    }

    notifySuccess('Histórico de conflitos limpo');
    setSelectedConflictHistoryIds(new Set());
    await fetchConflictHistory();
    setDeletingConflictHistory(false);
  }

  async function handleRemoveConflictAssignment(assignmentId: string) {
    if (!user?.id) return;
    
    try {
      await deleteAdminAssignment(assignmentId);
    } catch (error) {
      notifyError('remover atribuição', error, 'Não foi possível remover a atribuição.');
      return;
    }

    notifySuccess('Atribuição removida', 'O conflito foi resolvido.');
    fetchData();
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
  const createShiftTotal = Math.max(
    1,
    Math.min(20, (Number(formData.day_quantity) || 0) + (Number(formData.night_quantity) || 0))
  );

  return (
    <div className="admin-surface space-y-4 p-3 sm:p-4">
      {/* Page Header */}
      <Card className="admin-surface border-border/70">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl ring-1 ring-border/70 shadow-inner"
                style={{ backgroundColor: currentSectorColor || '#1f2937' }}
              />
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">{currentSectorName}</h2>
                <p className="text-muted-foreground text-sm capitalize">
                  {viewMode === 'month'
                    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
                    : `Semana de ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM", { locale: ptBR })}`}
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="h-8 px-3 text-xs font-medium">
              {viewMode === 'month' ? 'Visão mensal' : 'Visão semanal'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card className="stat-card group">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Plantões</p>
                <p className="text-3xl font-semibold text-foreground leading-tight">{totalShifts}</p>
                <p className="text-xs text-muted-foreground mt-1">No período selecionado</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/20">
                <Calendar className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card group">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Atribuições</p>
                <p className="text-3xl font-semibold text-foreground leading-tight">{totalAssignments}</p>
                <p className="text-xs text-muted-foreground mt-1">Registros alocados</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/20">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card group">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Plantonistas</p>
                <p className="text-3xl font-semibold text-foreground leading-tight">{uniqueWorkers}</p>
                <p className="text-xs text-muted-foreground mt-1">Com plantão ativo</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/20">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card group">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Setores</p>
                <p className="text-3xl font-semibold text-foreground leading-tight">{sectors.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Disponíveis na instituição</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/20">
                <MapPin className="h-5 w-5" />
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
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={openConflictHistory}>
          <History className="h-4 w-4 mr-1" />
          Histórico de Conflitos
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConflictDialogOpen(true)}>
          <AlertTriangle className="h-4 w-4 mr-1" />
          Conflitos ({unresolvedConflicts.length})
        </Button>
      </div>

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
                    <span className="text-red-600">{getConflictSummaryLabel(conflict)}</span>
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
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-11 w-11 touch-manipulation active:scale-95 transition-transform"
                  onClick={navigatePrev}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <h2 className="text-lg font-bold min-w-[180px] text-center">
                  {viewMode === 'month' 
                    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
                    : `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM", { locale: ptBR })} - ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM/yyyy", { locale: ptBR })}`
                  }
                </h2>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-11 w-11 touch-manipulation active:scale-95 transition-transform"
                  onClick={navigateNext}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                  <>
                    {/* View Mode Toggle */}
                    <div className="flex overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
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

                    <Button 
                      variant="outline" 
                      onClick={() => {
                        if (filterSector === 'all') {
                          notifyWarning(
                            'Selecione um setor',
                            'Para copiar a escala, primeiro selecione um setor específico na lista à esquerda.',
                          );
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

                    <Button 
                      variant="outline" 
                      onClick={handleRecalculateValues}
                      disabled={recalculateLoading || filterSector === 'all'}
                      title={filterSector === 'all' ? 'Selecione um setor para recalcular' : 'Recalcular valores do mês com base nos valores individuais/setor atuais'}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${recalculateLoading ? 'animate-spin' : ''}`} />
                      {recalculateLoading ? 'Recalculando...' : 'Recalcular'}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={openSectorValuesFromCalendar}
                      disabled={filterSector === 'all'}
                      title={filterSector === 'all' ? 'Selecione um setor para editar valores' : 'Configurar valores padrão do setor'}
                    >
                      <DollarSign className="mr-2 h-4 w-4" />
                      Valores do Setor
                    </Button>

                    <Button
                      variant="outline"
                      onClick={openUserValuesFromCalendar}
                      disabled={filterSector === 'all'}
                      title={filterSector === 'all' ? 'Selecione um setor para editar valores individuais' : 'Configurar valores individuais'}
                    >
                      <UserCog className="mr-2 h-4 w-4" />
                      Valores Individuais
                    </Button>

                    <Button variant="outline" onClick={handlePrintSchedule}>
                      <Printer className="mr-2 h-4 w-4" />
                      Imprimir
                    </Button>
                    <Button variant="outline" onClick={handleDownloadScheduleCSV}>
                      <Download className="mr-2 h-4 w-4" />
                      Baixar CSV
                    </Button>
                    <Button variant="outline" onClick={handleDownloadSchedulePDF}>
                      <FileText className="mr-2 h-4 w-4" />
                      Baixar PDF
                    </Button>
                    <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                      <Upload className="mr-2 h-4 w-4" />
                      Importar Escala
                    </Button>

                    <Button onClick={() => openCreateShift()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Plantão
                    </Button>
                  </>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/60 p-2">
              <span className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Acoes da Escala
              </span>
              <Button
                variant="destructive"
                onClick={handleDeleteCurrentScale}
                disabled={deletingCurrentScale}
                title={
                  filterSector === 'all'
                    ? 'Selecione um setor para excluir a escala'
                    : filteredShifts.length === 0
                      ? 'Não há plantões no período atual para excluir'
                      : 'Excluir todos os plantões do período atual'
                }
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deletingCurrentScale ? 'Excluindo escala...' : 'Excluir Escala'}
              </Button>
            </div>
          </div>

          {/* Calendar Content */}
          {filterSector === 'all' ? (
            <div className="space-y-6">
              {/* Summary Card */}
              <Card className="admin-surface border-border/60">
                <CardHeader className="admin-surface-header py-3">
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
                  <Card
                    key={sector.id}
                    className="admin-surface border-2 shadow-sm"
                    style={{ borderColor: sector.color || '#22c55e' }}
                  >
                    <CardHeader className="admin-surface-header py-3" style={{ backgroundColor: `${sector.color || '#22c55e'}10` }}>
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
                    <CardContent className="p-3 sm:p-4">
                      {renderCalendarGrid(sectorShifts, { hideSectorName: true, sectorContextId: sector.id })}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Show message if no sectors have shifts */}
              {sectors.filter(sector => shifts.filter(s => s.sector_id === sector.id).length > 0).length === 0 && (
                <Card className="admin-surface border-border/60">
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
                <Card className="admin-surface border-2 shadow-sm" style={{ borderColor: sector.color || '#22c55e' }}>
                  <CardHeader className="admin-surface-header py-3" style={{ backgroundColor: `${sector.color || '#22c55e'}10` }}>
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
                          onClick={() => setFilterSector('all')}
                        >
                          Ver todos
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4">
                    {renderCalendarGrid(sectorShifts, { hideSectorName: true, sectorContextId: filterSector })}
                  </CardContent>
                </Card>
              );
            })()
          )}
        </div>
      </div>

      {/* Day Detail Dialog */}
      <SectorValuesDialog
        open={valuesDialogOpen}
        onOpenChange={setValuesDialogOpen}
        sector={selectedSectorForValues}
        tenantId={currentTenantId || ''}
        userId={user?.id}
        onSuccess={fetchData}
      />

      <UserSectorValuesDialog
        open={userValuesDialogOpen}
        onOpenChange={setUserValuesDialogOpen}
        sector={selectedSectorForUserValues}
        tenantId={currentTenantId || ''}
        userId={user?.id}
        month={currentDate.getMonth() + 1}
        year={currentDate.getFullYear()}
        onSuccess={fetchData}
      />

      {/* Day Detail Dialog */}
      <Dialog
        open={dayDialogOpen}
        onOpenChange={(open) => {
          setDayDialogOpen(open);
          if (!open) {
            setDayDialogSectorId(null);
            setDayDialogFocusedShiftId(null);
            setDaySelectedShiftIds(new Set());
          }
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
                {selectedDate &&
                  dayDialogFocusedShiftId &&
                  getShiftsForDayDialog(selectedDate).length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDayDialogFocusedShiftId(null)}
                    >
                      Abrir todos ({getShiftsForDayDialog(selectedDate).length})
                    </Button>
                  )}
                {selectedDate && getDisplayedShiftsForDayDialog(selectedDate).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAllDisplayedDayShifts}
                  >
                    {(() => {
                      const displayed = getDisplayedShiftsForDayDialog(selectedDate);
                      const displayedIds = displayed.map((s) => s.id);
                      const allDisplayedSelected =
                        displayedIds.length > 0 && displayedIds.every((id) => daySelectedShiftIds.has(id));
                      return allDisplayedSelected ? 'Desmarcar todos' : `Selecionar todos (${displayedIds.length})`;
                    })()}
                  </Button>
                )}
                {daySelectedShiftIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelectedDayShifts}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir selecionados ({daySelectedShiftIds.size})
                  </Button>
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
            {selectedDate && getShiftsForDayDialog(selectedDate).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                <span className="pr-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Acoes Deste Dia
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReplicateWeeks(1);
                    setReplicateDayDialogOpen(true);
                  }}
                >
                  <Repeat className="mr-2 h-4 w-4" />
                  Replicar Dia
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openReplicateCustomDayDialog}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Replicar para outro dia
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openReplicateWeekDialog}
                  disabled={shifts.length === 0}
                >
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Replicar Semana
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingDayShifts}
                  onClick={handleDeleteDayShifts}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deletingDayShifts
                    ? 'Excluindo...'
                    : `Excluir Dia (${getShiftsForDayDialog(selectedDate).length})`}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openDeleteDaysDialog}
                  disabled={shifts.length === 0 || deletingDaysRange}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir Dias
                </Button>
              </div>
            )}

            {selectedDate && getDisplayedShiftsForDayDialog(selectedDate).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum plantão neste dia
              </p>
            ) : (
              selectedDate && getDisplayedShiftsForDayDialog(selectedDate).map(shift => {
                const shiftAssignments = getAssignmentsForShift(shift.id);
                const shiftPendingOffers = getOffersForShift(shift.id);
                const sectorColor = getSectorColor(shift.sector_id, shift.hospital);
                const sectorName = getSectorName(shift.sector_id, shift.hospital);
                const isAvailable = isShiftAvailable(shift);
                const showSectorName = filterSector === 'all' && !dayDialogSectorId;
                
                return (
                  <Card 
                    key={shift.id}
                    style={{ borderLeft: `4px solid ${sectorColor}` }}
                    className="admin-surface"
                  >
                    <CardHeader className="admin-surface-header py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={daySelectedShiftIds.has(shift.id)}
                            onCheckedChange={() => toggleDayShiftSelection(shift.id)}
                            className="mt-1"
                          />
                          <div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mb-2 h-7 px-2 text-xs"
                              onClick={() => openQuickValueEdit(shift)}
                            >
                              Ajustar valor
                            </Button>
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
                                  className="admin-block-card flex items-center justify-between p-3 text-foreground"
                                >
                                  <div className="min-w-0 flex items-center gap-2">
                                    <Users className="h-4 w-4 text-primary" />
                                    <div className="min-w-0">
                                      <div className="truncate font-medium text-sm">
                                        {getAssignmentName(assignment)}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {(() => {
                                          const info = getAssignmentDisplayInfo(assignment, shift);
                                          const label =
                                            info.source === 'individual'
                                              ? 'Individual'
                                              : info.source === 'assigned'
                                                ? 'Editado'
                                                : info.source === 'base'
                                                  ? 'Base'
                                                  : info.source === 'sector_default'
                                                    ? 'Padrão'
                                                    : 'Sem valor';
                                          const valueText = info.value === null ? '—' : `R$ ${info.value.toFixed(2)}`;
                                          const durationLabel = info.durationHours !== 12 ? ` (${info.durationHours.toFixed(0)}h)` : '';
                                          return (
                                            <span className="inline-flex items-center gap-2">
                                              <span>Pagamento: {valueText}</span>
                                              <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                                                {label}{durationLabel}
                                              </Badge>
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="ml-2 flex shrink-0 items-center gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 px-2"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openTransferDialog(assignment, shift);
                                      }}
                                    >
                                      <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                                      Transferir
                                    </Button>
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
                                  className="admin-block-card flex items-center justify-between border-blue-200 bg-blue-50 p-3"
                                >
                                  <div>
                                    <div className="font-medium text-sm text-blue-800">
                                      {getOfferName(offer)}
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

      <Dialog
        open={replicateWeekDialogOpen}
        onOpenChange={(open) => {
          if (!replicateWeekLoading) {
            setReplicateWeekDialogOpen(open);
            if (!open) {
              setReplicateWeekSourceStart(null);
              setReplicateWeekTargetStart(null);
            }
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5" />
              Replicar semana
            </DialogTitle>
            <DialogDescription>
              Escolha uma semana origem e o início da semana destino que deve receber os plantões.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Semana origem</Label>
                <Input
                  type="date"
                  value={replicateWeekSourceStart ? format(replicateWeekSourceStart, 'yyyy-MM-dd') : ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setReplicateWeekSourceStart(value ? parseISO(value) : null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Semana destino</Label>
                <Input
                  type="date"
                  value={replicateWeekTargetStart ? format(replicateWeekTargetStart, 'yyyy-MM-dd') : ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setReplicateWeekTargetStart(value ? parseISO(value) : null);
                  }}
                />
              </div>
            </div>

            <div className="admin-block-card border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
              Os plantões de cada dia da semana origem serão transferidos para a mesma posição da semana destino.
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setReplicateWeekDialogOpen(false)}
                disabled={replicateWeekLoading}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleReplicateWeekToWeek}
                disabled={
                  replicateWeekLoading ||
                  !replicateWeekSourceStart ||
                  !replicateWeekTargetStart
                }
              >
                {replicateWeekLoading ? 'Replicando...' : 'Replicar semana'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDaysDialogOpen}
        onOpenChange={(open) => {
          if (!deletingDaysRange) {
            setDeleteDaysDialogOpen(open);
            if (!open) {
              setDeleteDaysStart(null);
              setDeleteDaysEnd(null);
              setDeleteDaysConfirmText('');
            }
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Excluir dias da escala
            </DialogTitle>
            <DialogDescription>
              Selecione o intervalo de dias que devem ser removidos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Data inicial</Label>
                <Input
                  type="date"
                  value={deleteDaysStart ? format(deleteDaysStart, 'yyyy-MM-dd') : ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDeleteDaysStart(value ? parseISO(value) : null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Data final</Label>
                <Input
                  type="date"
                  value={deleteDaysEnd ? format(deleteDaysEnd, 'yyyy-MM-dd') : ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDeleteDaysEnd(value ? parseISO(value) : null);
                  }}
                />
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/10 p-3 text-sm text-muted-foreground">
              Esta ação remove todos os plantões cadastrados nesse intervalo. Digite <strong>EXCLUIR</strong> para confirmar.
            </div>
            <Input
              placeholder="Digite EXCLUIR para confirmar"
              value={deleteDaysConfirmText}
              onChange={(event) => setDeleteDaysConfirmText(event.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteDaysDialogOpen(false)}
              disabled={deletingDaysRange}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              onClick={handleDeleteDaysRange}
              disabled={
                deletingDaysRange ||
                !deleteDaysStart ||
                !deleteDaysEnd ||
                deleteDaysConfirmText.trim().toUpperCase() !== 'EXCLUIR'
              }
            >
              {deletingDaysRange ? 'Excluindo...' : 'Excluir dias'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Assignment Dialog */}
      <Dialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open);
          if (!open) {
            setTransferAssignment(null);
            setTransferSourceShift(null);
            setTransferTargetSectorId('');
            setTransferTargetShiftId('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Plantonista</DialogTitle>
            <DialogDescription>
              Migre o plantonista para outro setor no mesmo dia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {transferAssignment && transferSourceShift ? (
                <>
                  <strong>{getAssignmentName(transferAssignment)}</strong> sairá de{' '}
                  <strong>{getSectorName(transferSourceShift.sector_id, transferSourceShift.hospital)}</strong>{' '}
                  ({format(parseISO(transferSourceShift.shift_date), 'dd/MM/yyyy')} • {transferSourceShift.start_time.slice(0, 5)}-{transferSourceShift.end_time.slice(0, 5)}).
                </>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Setor de destino</Label>
              <Select
                value={transferTargetSectorId}
                onValueChange={(value) => {
                  setTransferTargetSectorId(value);
                  const firstTargetShiftId =
                    shifts
                      .filter((s) => s.id !== transferSourceShift?.id)
                      .filter((s) => s.shift_date === transferSourceShift?.shift_date)
                      .filter((s) => s.sector_id === value)
                      .filter((s) => !assignments.some((a) => a.shift_id === s.id && a.user_id === transferAssignment?.user_id))
                      .sort((a, b) => `${a.shift_date}T${a.start_time}`.localeCompare(`${b.shift_date}T${b.start_time}`))[0]?.id || '';
                  setTransferTargetShiftId(firstTargetShiftId);
                }}
              >
                <SelectTrigger className={SQUARE_SELECT_TRIGGER_CLASS}>
                  <SelectValue placeholder="Selecione o setor destino" />
                </SelectTrigger>
                <SelectContent className={SQUARE_SELECT_CONTENT_CLASS}>
                  {transferAllowedSectors.map((sector) => (
                    <SelectItem key={sector.id} value={sector.id} className={SQUARE_SELECT_ITEM_CLASS}>
                      {sector.name}
                    </SelectItem>
                  ))}
                  {transferAllowedSectors.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Nenhum setor elegível para este plantonista.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Horário no setor de destino</Label>
              <p className="text-xs text-muted-foreground">
                Ao trocar o setor, o primeiro horário compatível é selecionado automaticamente.
              </p>
              <Select value={transferTargetShiftId} onValueChange={setTransferTargetShiftId}>
                <SelectTrigger className={SQUARE_SELECT_TRIGGER_CLASS} disabled={!transferTargetSectorId}>
                  <SelectValue placeholder="Selecione o horário do plantão" />
                </SelectTrigger>
                <SelectContent className={SQUARE_SELECT_CONTENT_CLASS}>
                  {transferTargetCandidates.map((target) => (
                    <SelectItem key={target.id} value={target.id} className={SQUARE_SELECT_ITEM_CLASS}>
                      {target.start_time.slice(0, 5)}-{target.end_time.slice(0, 5)} • {getSectorName(target.sector_id, target.hospital)}
                    </SelectItem>
                  ))}
                  {transferTargetCandidates.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Nenhum horário disponível neste setor para este dia.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" disabled={!transferTargetShiftId || transferring} onClick={handleTransferAssignment}>
              {transferring ? 'Transferindo...' : 'Confirmar Transferência'}
            </Button>
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
          className="admin-surface max-w-2xl max-h-[88vh] overflow-y-auto"
          onCloseAutoFocus={(e) => {
            // Prevent focus from returning to the trigger (edit button), which can cause an immediate re-open.
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Editar Plantão' : 'Novo Plantão'}</DialogTitle>
            <DialogDescription>
              Configure o plantão, atribuição e repetição com o mesmo padrão visual do aplicativo.
            </DialogDescription>
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
                          <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600/70 bg-card" />
                          {sector.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // Show selected sector as a badge when viewing specific sector
              <div className="admin-block-card flex items-center gap-2">
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
              <div className="admin-block-card flex items-center gap-2">
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
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setFormData((prev) => {
                      const nextDuration = prev.end_time
                        ? durationToInputValue(calculateDurationHours(nextStart, prev.end_time))
                        : prev.duration_hours;
                      return { ...prev, start_time: nextStart, duration_hours: nextDuration };
                    });
                  }}
                  required
                />
              </div>
            </div>

            {/* Quantity field for creating multiple shifts - ONLY for new shifts */}
            {!editingShift && (
              <div className="admin-block-card space-y-3">
                <Label className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-blue-600" />
                  Quantidade por Tipo (neste dia)
                </Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="day_quantity">Diurnos</Label>
                    <Input
                      id="day_quantity"
                      type="number"
                      min={0}
                      max={20}
                      value={formData.day_quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        const nextDay = Number.isNaN(val) ? 0 : val;
                        updateShiftTypeCounts(nextDay, Number(formData.night_quantity) || 0);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="night_quantity">Noturnos</Label>
                    <Input
                      id="night_quantity"
                      type="number"
                      min={0}
                      max={20}
                      value={formData.night_quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        const nextNight = Number.isNaN(val) ? 0 : val;
                        updateShiftTypeCounts(Number(formData.day_quantity) || 0, nextNight);
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs font-medium text-primary">
                  Total: {createShiftTotal} plantão(ões)
                  {createShiftTotal > 1 && (
                    <span className="text-muted-foreground"> - atribua cada um abaixo</span>
                  )}
                </p>
                {createShiftTotal > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Padrão aplicado: Diurno 07:00-19:00 e Noturno 19:00-07:00 (você pode ajustar por linha).
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
                    setFormData((prev) => ({ ...prev, end_time: `${endH}:${endM}`, duration_hours: v }));
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
                    setFormData((prev) => ({ ...prev, duration_hours: value }));
                    
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
                  type="text"
                  placeholder="Ex: 12:00"
                  value={formData.end_time}
                  onChange={(e) => {
                    let value = e.target.value;
                    value = value.replace(/[^\d:]/g, '');
                    if (!value.includes(':') && value.length > 2) {
                      value = `${value.slice(0, 2)}:${value.slice(2)}`;
                    }
                    const colonIndex = value.indexOf(':');
                    if (colonIndex !== -1) {
                      value = `${value.slice(0, colonIndex + 1)}${value
                        .slice(colonIndex + 1)
                        .replace(/:/g, '')}`;
                    }
                    if (value.length > 5) value = value.slice(0, 5);
                    const hasFullTime = /^\d{2}:\d{2}$/.test(value);
                    setFormData((prev) => {
                      const nextDuration =
                        hasFullTime && prev.start_time
                          ? durationToInputValue(calculateDurationHours(prev.start_time, value))
                          : prev.duration_hours;
                      return { ...prev, end_time: value, duration_hours: nextDuration };
                    });
                  }}
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
              {!editingShift && createShiftTotal > 1 ? (
                <div className="admin-block-card col-span-2 space-y-3">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-green-600" />
                    Atribuição Individual ({createShiftTotal} plantões)
                  </Label>
                  <div className="grid gap-3 max-h-[300px] overflow-y-auto pr-2">
                    {Array.from({ length: createShiftTotal }, (_, i) => {
                      const sectorMembers = formData.sector_id ? getMembersForSector(formData.sector_id) : [];
                      const shiftData = multiShifts[i] || { user_id: 'vago', start_time: '07:00', end_time: '19:00' };
                      const membersToShow = sortMembersAlphabetically(sectorMembers ?? []);                     
                      return (
                        <div key={i} className="admin-block-card space-y-2 p-3">
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
                              <SelectTrigger className={`${SQUARE_SELECT_TRIGGER_CLASS} min-h-8 py-1`}>
                                <SelectValue placeholder="Selecionar" />
                              </SelectTrigger>
                              <SelectContent className={SQUARE_SELECT_CONTENT_CLASS}>
                                <SelectItem value="vago" className={SQUARE_SELECT_ITEM_CLASS}>
                                  <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600/70 bg-card" />
                                    Vago
                                  </span>
                                </SelectItem>
                                <SelectItem value="disponivel" className={SQUARE_SELECT_ITEM_CLASS}>
                                  <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600 bg-emerald-600/15" />
                                    Disponível
                                  </span>
                                </SelectItem>
                                {membersToShow.map((m) => (
                                  <SelectItem key={m.user_id} value={m.user_id} className={SQUARE_SELECT_ITEM_CLASS}>
                                    <span className="flex items-center gap-2">
                                      <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600 bg-emerald-600/15" />
                                      {getMemberDisplayName(m)}
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
                    <SelectTrigger className={SQUARE_SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="Selecionar tipo" />
                    </SelectTrigger>
                    <SelectContent className={SQUARE_SELECT_CONTENT_CLASS}>
                      <SelectItem value="vago" className={SQUARE_SELECT_ITEM_CLASS}>
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600/70 bg-card" />
                          Plantão Vago
                        </span>
                      </SelectItem>
                      <SelectItem value="disponivel" className={SQUARE_SELECT_ITEM_CLASS}>
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600 bg-emerald-600/15" />
                          Plantão Disponível
                        </span>
                      </SelectItem>
                      {(() => {
                        const sectorMembers = formData.sector_id ? getMembersForSector(formData.sector_id) : [];
                        const membersToShow = sortMembersAlphabetically(sectorMembers ?? []);
                        const label = 'Plantonistas do Setor';
                        if (membersToShow.length > 0) {
                          return (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                                {label}
                              </div>
                              {membersToShow.map((m) => (
                                <SelectItem key={m.user_id} value={m.user_id} className={SQUARE_SELECT_ITEM_CLASS}>
                                  <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600 bg-emerald-600/15" />
                                    {getMemberDisplayName(m)}
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
                  {editingShift && editingCurrentAssignment && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full sm:w-auto"
                      onClick={() => openTransferDialog(editingCurrentAssignment, editingShift)}
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Transferir este plantonista para outro setor
                    </Button>
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
            <div className="admin-block-card space-y-3">
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
                    const qty = createShiftTotal || 1;
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
                <SelectTrigger className="h-auto min-h-10 py-2 [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words">
                  <SelectValue placeholder="Selecione um plantonista" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px] overflow-y-auto">
                  {sortMembersAlphabetically(
                    selectedShift?.sector_id ? getMembersForSector(selectedShift.sector_id) : []
                  ).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {getMemberDisplayName(m)}
                    </SelectItem>
                  ))}
                  {selectedShift?.sector_id &&
                    sortMembersAlphabetically(getMembersForSector(selectedShift.sector_id)).length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum plantonista cadastrado neste setor
                      </div>
                    )}
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
              {selectedShift && assignData.user_id && (
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const value = resolveValue({
                      raw: assignData.assigned_value,
                      sector_id: selectedShift.sector_id || null,
                      start_time: selectedShift.start_time.slice(0, 5),
                      end_time: selectedShift.end_time.slice(0, 5),
                      user_id: assignData.user_id,
                      // For preview, show what the system will pay using the same rules as Financeiro.
                      useSectorDefault: true,
                      applyProRata: true,
                    });
                    const duration = calculateDurationHours(selectedShift.start_time.slice(0, 5), selectedShift.end_time.slice(0, 5));
                    return `Valor que será pago: ${value === null ? '—' : `R$ ${value.toFixed(2)}`}${duration !== 12 ? ` (${duration.toFixed(0)}h)` : ''}`;
                  })()}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={!assignData.user_id}>
              Atribuir Plantonista
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Conflict Details Dialog */}
      <Dialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Conflitos de Escala ({unresolvedConflicts.length})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Os conflitos abaixo indicam plantonistas escalados em mais de um local no mesmo horário.
              Você pode remover uma das atribuições ou reconhecer o conflito se for intencional.
            </p>

            {unresolvedConflicts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                ✅ Nenhum conflito detectado
              </div>
            ) : (
              unresolvedConflicts.map(conflict => {
                return (
                  <Card 
                    key={conflict.id} 
                    className="border-2 border-red-400 bg-red-50/50 dark:bg-red-950/20"
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-red-600" />
                          <span className="font-bold text-lg break-words">{conflict.userName}</span>
                        </div>
                        <Badge variant="outline">
                          {format(parseISO(conflict.date), "EEEE, dd/MM/yyyy", { locale: ptBR })}
                        </Badge>
                      </div>

                      {/* Conflicting shifts */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">
                          {getConflictSummaryLabel(conflict)}
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-600">
              <FileText className="h-5 w-5" />
              Justificar Conflito
            </DialogTitle>
          </DialogHeader>
          
          {pendingAcknowledgeConflict && (
            <div className="space-y-4">
              <div className="admin-block-card border-yellow-200 bg-yellow-50 p-3 dark:bg-yellow-950/20">
                <p className="font-medium break-words">{pendingAcknowledgeConflict.userName}</p>
                <p className="text-sm text-muted-foreground">
                  {format(parseISO(pendingAcknowledgeConflict.date), "dd/MM/yyyy", { locale: ptBR })}
                </p>
                <div className="mt-2 space-y-1">
                  {pendingAcknowledgeConflict.shifts.map((s, i) => (
                    <p key={i} className="text-sm break-words">
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
              
              <div className="flex flex-wrap justify-end gap-2">
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Confirmar Remoção
            </DialogTitle>
          </DialogHeader>
          
          {pendingRemoval && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground break-words">
                Confirme a remoção do plantonista <strong>{pendingRemoval.conflict.userName}</strong> do local abaixo:
              </p>
              
              <div className="space-y-3">
                <div className="admin-block-card border-red-200 bg-red-50 p-3 dark:bg-red-950/20">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Será REMOVIDO de:</p>
                  <p className="font-medium break-words">{pendingRemoval.assignmentToRemove.sectorName}</p>
                  <p className="text-sm text-muted-foreground">
                    {pendingRemoval.assignmentToRemove.startTime.slice(0,5)} - {pendingRemoval.assignmentToRemove.endTime.slice(0,5)}
                  </p>
                </div>
                
                <div className="admin-block-card border-green-200 bg-green-50 p-3 dark:bg-green-950/20">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Permanecerá em:</p>
                  <p className="font-medium break-words">{pendingRemoval.assignmentToKeep.sectorName}</p>
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85vh] overflow-y-auto">
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
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-md border border-border bg-muted/20">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all-conflict-history"
                    checked={conflictHistory.length > 0 && selectedConflictHistoryIds.size === conflictHistory.length}
                    onCheckedChange={(checked) => toggleSelectAllConflictHistory(Boolean(checked))}
                    disabled={deletingConflictHistory}
                  />
                  <Label htmlFor="select-all-conflict-history" className="text-sm cursor-pointer">
                    Selecionar todos
                  </Label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedConflictHistoryIds.size} selecionado(s)
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={deleteSelectedConflictHistory}
                    disabled={deletingConflictHistory || selectedConflictHistoryIds.size === 0}
                  >
                    {deletingConflictHistory ? 'Excluindo...' : `Excluir selecionados (${selectedConflictHistoryIds.size})`}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deleteAllConflictHistory}
                    disabled={deletingConflictHistory || conflictHistory.length === 0}
                    className="text-destructive border-destructive/40 hover:bg-destructive/10"
                  >
                    Excluir tudo
                  </Button>
                </div>
              </div>
              {(() => {
                const acknowledgedHistory = conflictHistory.filter(
                  (item) => item.resolution_type === 'acknowledged'
                );
                const removedHistory = conflictHistory.filter(
                  (item) => item.resolution_type !== 'acknowledged'
                );

                return (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 rounded-md border border-yellow-300 bg-yellow-50/70 px-3 py-2 dark:bg-yellow-950/20">
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                          Conflitos aceitos com justificativa ({acknowledgedHistory.length})
                        </p>
                      </div>
                      {acknowledgedHistory.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-1">Nenhum conflito aceito registrado.</p>
                      ) : (
                        acknowledgedHistory.map((resolution) => renderConflictHistoryCard(resolution))
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 rounded-md border border-blue-300 bg-blue-50/70 px-3 py-2 dark:bg-blue-950/20">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          Conflitos resolvidos por remoção ({removedHistory.length})
                        </p>
                      </div>
                      {removedHistory.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-1">Nenhuma remoção registrada.</p>
                      ) : (
                        removedHistory.map((resolution) => renderConflictHistoryCard(resolution))
                      )}
                    </div>
                  </div>
                );
              })()}
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
          
          <div className="admin-block-card mb-4 p-3">
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
                <SelectTrigger className={SQUARE_SELECT_TRIGGER_CLASS}>
                  <SelectValue placeholder="Selecione um setor" />
                </SelectTrigger>
                <SelectContent className={SQUARE_SELECT_CONTENT_CLASS}>
                  {sectors.map(sector => (
                    <SelectItem key={sector.id} value={sector.id} className={SQUARE_SELECT_ITEM_CLASS}>
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600/70 bg-card" />
                        {sector.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auto-detected shift type indicator */}
            {formData.start_time && formData.end_time && (
              <div className="admin-block-card flex items-center gap-2 p-3">
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
                  <SelectTrigger className={SQUARE_SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent className={SQUARE_SELECT_CONTENT_CLASS}>
                    <SelectItem value="vago" className={SQUARE_SELECT_ITEM_CLASS}>
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600/70 bg-card" />
                        Plantão Vago
                      </span>
                    </SelectItem>
                    <SelectItem value="disponivel" className={SQUARE_SELECT_ITEM_CLASS}>
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600 bg-emerald-600/15" />
                        Plantão Disponível
                      </span>
                    </SelectItem>
                    {(() => {
                      const sectorMembers = formData.sector_id ? getMembersForSector(formData.sector_id) : [];
                      const membersToShow = sortMembersAlphabetically(sectorMembers);
                      const label = 'Plantonistas do Setor';
                      
                      if (membersToShow.length > 0) {
                        return (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                              {label}
                            </div>
                            {membersToShow.map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id} className={SQUARE_SELECT_ITEM_CLASS}>
                                <span className="flex items-center gap-2">
                                  <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600 bg-emerald-600/15" />
                                  {getMemberDisplayName(m)}
                                </span>
                              </SelectItem>
                            ))}
                          </>
                        );
                      }
                      return (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
                          Nenhum plantonista cadastrado neste setor
                        </div>
                      );
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

      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          setImportDialogOpen(open);
          if (!open) {
            setImportPreviewRows([]);
            setImportErrors([]);
            setImportFileName('');
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar Escala</DialogTitle>
            <DialogDescription>
              Envie um arquivo CSV/XLSX com colunas: setor, data, início e fim. Campos opcionais: hospital, local, valor, observações, título.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void handleImportScheduleFile(file);
                event.currentTarget.value = '';
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => importFileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Selecionar arquivo
              </Button>
              {importFileName && (
                <span className="text-sm text-muted-foreground">{importFileName}</span>
              )}
            </div>

            {importErrors.length > 0 && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                  Avisos ({importErrors.length})
                </p>
                <div className="mt-1 max-h-32 overflow-y-auto text-xs text-yellow-700 dark:text-yellow-200">
                  {importErrors.slice(0, 20).map((err, idx) => (
                    <p key={`${idx}-${err}`}>{err}</p>
                  ))}
                </div>
              </div>
            )}

            {importPreviewRows.length > 0 && (
              <div className="rounded-lg border border-border/70 bg-card p-3">
                <p className="mb-2 text-sm font-medium">
                  Pré-visualização ({importPreviewRows.length} linha(s) válida(s))
                </p>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-2">Data</th>
                        <th className="py-1 pr-2">Setor</th>
                        <th className="py-1 pr-2">Horário</th>
                        <th className="py-1 pr-2">Hospital</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreviewRows.slice(0, 30).map((row, idx) => (
                        <tr key={`${row.shift_date}-${row.sector_id}-${row.start_time}-${idx}`} className="border-t border-border/40">
                          <td className="py-1 pr-2">{format(parseISO(row.shift_date), 'dd/MM/yyyy')}</td>
                          <td className="py-1 pr-2">{row.sector_name}</td>
                          <td className="py-1 pr-2">{row.start_time} - {row.end_time}</td>
                          <td className="py-1 pr-2">{row.hospital}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={confirmImportSchedule}
                disabled={importPreviewRows.length === 0 || importingShifts}
              >
                {importingShifts ? 'Importando...' : `Importar ${importPreviewRows.length || ''}`.trim()}
              </Button>
            </div>
          </div>
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
            <div className="admin-block-card p-4">
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
                <div className="admin-block-card flex-1 px-4 py-2 text-center text-lg font-semibold">
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

            <div className="admin-block-card border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
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

      {/* Replicate Day Dialog */}
      <Dialog open={replicateDayDialogOpen} onOpenChange={setReplicateDayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5" />
              Replicar Escala do Dia
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="admin-block-card p-3">
              <p className="text-sm text-muted-foreground">Dia base</p>
              <p className="font-semibold">
                {selectedDate ? format(selectedDate, "EEEE, dd/MM/yyyy", { locale: ptBR }) : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedDate ? `${getShiftsForDayDialog(selectedDate).length} plantão(ões) serão replicados para o mesmo dia da semana.` : ''}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Quantas semanas replicar?</Label>
              <Select
                value={String(replicateWeeks)}
                onValueChange={(v) => setReplicateWeeks(parseInt(v, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 semana</SelectItem>
                  <SelectItem value="2">2 semanas</SelectItem>
                  <SelectItem value="3">3 semanas</SelectItem>
                  <SelectItem value="4">4 semanas</SelectItem>
                  <SelectItem value="5">5 semanas</SelectItem>
                  <SelectItem value="6">6 semanas</SelectItem>
                  <SelectItem value="7">7 semanas</SelectItem>
                  <SelectItem value="8">8 semanas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="admin-block-card border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
              A réplica copia horários, setor, observações e atribuições atuais para as próximas semanas.
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setReplicateDayDialogOpen(false)}
                disabled={replicateLoading}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleReplicateDayShifts}
                disabled={replicateLoading || !selectedDate}
              >
                {replicateLoading ? 'Replicando...' : `Replicar ${replicateWeeks}x`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={replicateCustomDayDialogOpen} onOpenChange={(open) => {
        if (!replicateCustomDayLoading) {
          setReplicateCustomDayDialogOpen(open);
          if (!open) {
            setReplicateCustomDayTargetDate(null);
          }
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Replicar para outro dia
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="admin-block-card p-3">
              <p className="text-sm text-muted-foreground">Dia base</p>
              <p className="font-semibold">
                {selectedDate ? format(selectedDate, "EEEE, dd/MM/yyyy", { locale: ptBR }) : '—'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Data de destino</Label>
              <Input
                type="date"
                value={replicateCustomDayTargetDate ? format(replicateCustomDayTargetDate, 'yyyy-MM-dd') : ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setReplicateCustomDayTargetDate(value ? parseISO(value) : null);
                }}
              />
            </div>

            <div className="admin-block-card border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
              Copia horários, setor, observações e atribuições do dia selecionado para outra data.
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setReplicateCustomDayDialogOpen(false)}
                disabled={replicateCustomDayLoading}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleReplicateDayToTargetDate}
                disabled={replicateCustomDayLoading || !replicateCustomDayTargetDate}
              >
                {replicateCustomDayLoading ? 'Replicando...' : 'Replicar para a data'}
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
                <SelectTrigger className="h-auto min-h-10 py-2 [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words">
                  <SelectValue placeholder="Manter como está" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px] overflow-y-auto">
                  <SelectItem value="__keep__">Manter como está</SelectItem>
                  <SelectItem value="__clear__">Remover plantonista (vago)</SelectItem>
                  {(() => {
                    const selectedShifts = shifts.filter((s) => bulkApplyShiftIds.includes(s.id));
                    const uniqueSectorIds = Array.from(
                      new Set(selectedShifts.map((s) => s.sector_id).filter((id): id is string => !!id))
                    );

                    if (uniqueSectorIds.length !== 1) {
                      return (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
                          Para atribuir plantonista em bloco, selecione plantões de um único setor.
                        </div>
                      );
                    }

                    const membersToShow = sortMembersAlphabetically(getMembersForSector(uniqueSectorIds[0]));
                    if (membersToShow.length === 0) {
                      return (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
                          Nenhum plantonista cadastrado neste setor
                        </div>
                      );
                    }

                    return membersToShow.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {getMemberDisplayName(m)}
                      </SelectItem>
                    ));
                  })()}
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
        if (!open && bulkEditSaving) return;

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
          onInteractOutside={(e) => {
            if (bulkEditSaving) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (bulkEditSaving) e.preventDefault();
          }}
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
                const originalAssignment = originalShift
                  ? assignments.find((a) => a.shift_id === originalShift.id) || null
                  : null;
                const sectorMembers = editData.sector_id ? getMembersForSector(editData.sector_id) : [];
                const membersToShow = sortMembersAlphabetically(sectorMembers);
                const sectorColor = getSectorColor(editData.sector_id, editData.hospital);
                const isNight = isNightShift(editData.start_time, editData.end_time);
                const currentStatusLabel = originalAssignment
                  ? getAssignmentName(originalAssignment)
                  : (originalShift && isShiftAvailable(originalShift) ? 'Disponível' : 'Vago');

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
                            <SelectTrigger className={SQUARE_SELECT_TRIGGER_CLASS}>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent className={SQUARE_SELECT_CONTENT_CLASS}>
                              <SelectItem value="__none__" className={SQUARE_SELECT_ITEM_CLASS}>Sem setor</SelectItem>
                              {sectors.map((sector) => (
                                <SelectItem key={sector.id} value={sector.id} className={SQUARE_SELECT_ITEM_CLASS}>
                                  <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600/70 bg-card" />
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
                            value={editData.assigned_user_id || '__keep__'} 
                            onValueChange={(v) => setBulkEditData(prev => prev.map((d, i) => 
                              i === index ? { ...d, assigned_user_id: v } : d
                            ))}
                          >
                            <SelectTrigger className={SQUARE_SELECT_TRIGGER_CLASS}>
                              <SelectValue placeholder="Selecionar" />
                            </SelectTrigger>
                            <SelectContent className={SQUARE_SELECT_CONTENT_CLASS}>
                              <SelectItem value="__keep__" className={SQUARE_SELECT_ITEM_CLASS}>
                                <span className="flex items-center gap-2">
                                  <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600/70 bg-card" />
                                  Manter atual
                                </span>
                              </SelectItem>
                              <SelectItem value="vago" className={SQUARE_SELECT_ITEM_CLASS}>
                                <span className="flex items-center gap-2">
                                  <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600/70 bg-card" />
                                  Vago
                                </span>
                              </SelectItem>
                              <SelectItem value="disponivel" className={SQUARE_SELECT_ITEM_CLASS}>
                                <span className="flex items-center gap-2">
                                  <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600 bg-emerald-600/15" />
                                  Disponível
                                </span>
                              </SelectItem>
                              {membersToShow.map((m) => (
                                <SelectItem key={m.user_id} value={m.user_id} className={SQUARE_SELECT_ITEM_CLASS}>
                                  <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 rounded-[4px] border-2 border-emerald-600 bg-emerald-600/15" />
                                    {getMemberDisplayName(m)}
                                  </span>
                                </SelectItem>
                              ))}
                              {membersToShow.length === 0 && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
                                  Nenhum plantonista cadastrado neste setor
                                </div>
                              )}
                            </SelectContent>
	                          </Select>
                            <p className="text-xs text-muted-foreground">Atual: {currentStatusLabel}</p>
                            {originalShift && assignments.some((a) => a.shift_id === originalShift.id) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2 w-full"
                                onClick={() => openTransferFromBulkEdit(originalShift.id)}
                              >
                                <ArrowRightLeft className="mr-2 h-4 w-4" />
                                Transferir para outro setor
                              </Button>
                            )}
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
                disabled={bulkEditSaving}
                onClick={closeBulkEditDialog}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={bulkEditSaving}>
                {bulkEditSaving ? 'Salvando...' : `Salvar Todos (${bulkEditData.length} plantões)`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteScaleDialogOpen}
        onOpenChange={(open) => {
          if (!deletingCurrentScale) {
            setDeleteScaleDialogOpen(open);
            if (!open) {
              setDeleteScaleConfirmText('');
              setDeleteScaleContext(null);
            }
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirmar exclusão de escala
            </DialogTitle>
            <DialogDescription>
              Esta ação é irreversível.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p>
              Setor: <span className="font-semibold">{deleteScaleContext?.sectorName ?? '-'}</span>
            </p>
            <p>
              Período: <span className="font-semibold">{deleteScaleContext?.periodLabel ?? '-'}</span>
            </p>
            <p>
              Plantões afetados: <span className="font-semibold">{deleteScaleContext?.count ?? 0}</span>
            </p>
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-200">
              Digite <span className="font-semibold">EXCLUIR</span> para liberar a exclusão.
            </div>
            <Input
              value={deleteScaleConfirmText}
              onChange={(e) => setDeleteScaleConfirmText(e.target.value)}
              placeholder="Digite EXCLUIR"
              autoComplete="off"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={deletingCurrentScale}
              onClick={() => {
                setDeleteScaleDialogOpen(false);
                setDeleteScaleConfirmText('');
                setDeleteScaleContext(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={deletingCurrentScale || deleteScaleConfirmText.trim().toUpperCase() !== 'EXCLUIR'}
              onClick={confirmDeleteCurrentScale}
            >
              {deletingCurrentScale ? 'Excluindo...' : 'Excluir Escala'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
