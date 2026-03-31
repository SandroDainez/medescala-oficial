import { format } from 'date-fns';
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface ScheduleSector {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
  default_day_value?: number | null;
  default_night_value?: number | null;
}

export interface ScheduleShift {
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

export interface ScheduleAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_value: number | null;
  status: string;
  profile: { name: string | null; full_name?: string | null } | null;
}

export interface ScheduleOffer {
  id: string;
  shift_id: string;
  user_id: string;
  status: string;
  message: string | null;
  profile: { name: string | null; full_name?: string | null } | null;
}

export interface ScheduleMember {
  user_id: string;
  profile: { id: string; name: string | null; full_name?: string | null; profile_type?: string | null } | null;
}

export interface ScheduleSectorMembership {
  id: string;
  sector_id: string;
  user_id: string;
}

export interface AdminScheduleFetchParams {
  tenantId: string;
  userId: string;
  currentDate: Date;
  viewMode: 'month' | 'week';
  filterSector: string;
}

export interface AdminScheduleFetchResult {
  startStr: string;
  endStr: string;
  sectors: ScheduleSector[];
  sectorMemberships: ScheduleSectorMembership[];
  members: ScheduleMember[];
  userSectorValues: Map<string, { day_value: number | null; night_value: number | null }>;
  shifts: ScheduleShift[];
  assignments: ScheduleAssignment[];
  offers: ScheduleOffer[];
  acknowledgedConflictKeys: Set<string>;
}

function safeParseConflictDetails(details: unknown): Array<Record<string, unknown>> {
  if (!details) return [];
  if (Array.isArray(details)) return details as Array<Record<string, unknown>>;
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details);
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildStoredConflictKey(params: {
  plantonistaId: string | null;
  conflictDate: string | null;
  conflictDetails: unknown;
}) {
  const assignmentIds = safeParseConflictDetails(params.conflictDetails)
    .map((item) => {
      const value = item.assignmentId ?? item.assignment_id;
      return typeof value === 'string' ? value : null;
    })
    .filter((value): value is string => Boolean(value))
    .sort();

  if (params.plantonistaId && params.conflictDate && assignmentIds.length > 1) {
    return `${params.plantonistaId}_${params.conflictDate}_${assignmentIds.join('|')}`;
  }

  if (params.plantonistaId && params.conflictDate) {
    return `${params.plantonistaId}_${params.conflictDate}`;
  }

  return null;
}

export async function fetchAdminScheduleData({
  tenantId,
  userId,
  currentDate,
  viewMode,
  filterSector,
}: AdminScheduleFetchParams): Promise<AdminScheduleFetchResult> {
  const start =
    viewMode === 'month'
      ? startOfMonth(currentDate)
      : startOfWeek(currentDate, { weekStartsOn: 1 });
  const end =
    viewMode === 'month'
      ? endOfMonth(currentDate)
      : endOfWeek(currentDate, { weekStartsOn: 1 });

  const startStr = format(start, 'yyyy-MM-dd');
  const endStr = format(end, 'yyyy-MM-dd');

  const [shiftsRes, membersRes, sectorsRes, sectorMembershipsRes] = await Promise.all([
    supabase
      .from('shifts')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('shift_date', startStr)
      .lte('shift_date', endStr)
      .order('shift_date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase
      .from('memberships')
      .select('user_id, role, profile:profiles!memberships_user_id_profiles_fkey(id, name, full_name, profile_type)')
      .eq('tenant_id', tenantId)
      .eq('active', true),
    supabase
      .from('sectors')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('name'),
    supabase
      .from('sector_memberships')
      .select('id, sector_id, user_id')
      .eq('tenant_id', tenantId),
  ]);

  if (shiftsRes.error) {
    console.error('[adminScheduleData] shifts fetch failed', shiftsRes.error);
  }
  if (membersRes.error) {
    console.error('[adminScheduleData] memberships fetch failed', membersRes.error);
  }
  if (sectorsRes.error) {
    console.error('[adminScheduleData] sectors fetch failed', sectorsRes.error);
  }
  if (sectorMembershipsRes.error) {
    console.error('[adminScheduleData] sector_memberships fetch failed', sectorMembershipsRes.error);
  }

  const sectors = (sectorsRes.data ?? []) as ScheduleSector[];
  const sectorMemberships = (sectorMembershipsRes.data ?? []) as ScheduleSectorMembership[];
  const scopedSectorUserIds =
    filterSector && filterSector !== 'all'
      ? new Set(
          sectorMemberships
            .filter((membership) => membership.sector_id === filterSector)
            .map((membership) => membership.user_id),
        )
      : null;

  const members = ((membersRes.data ?? []) as unknown as Array<ScheduleMember & { role?: string | null }>)
    .filter((member) => member.profile?.profile_type === 'plantonista')
    .filter((member) => !scopedSectorUserIds || scopedSectorUserIds.has(member.user_id));
  const allowedUserIds = new Set(members.map((member) => member.user_id));
  const memberDisplayNameByUserId = new Map<string, string>();
  for (const member of members) {
    const displayName = member.profile?.full_name?.trim() || member.profile?.name?.trim();
    if (member.user_id && displayName) {
      memberDisplayNameByUserId.set(member.user_id, displayName);
    }
  }

  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const { data: userValuesData, error: userValuesError } = await supabase
    .from('user_sector_values')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('month', currentMonth)
    .eq('year', currentYear);

  if (userValuesError) {
    console.error('[adminScheduleData] user_sector_values fetch failed', userValuesError);
  }

  const userSectorValues = new Map<string, { day_value: number | null; night_value: number | null }>();
  (userValuesData ?? []).forEach((value: any) => {
    userSectorValues.set(`${value.sector_id}:${value.user_id}`, {
      day_value: value.day_value,
      night_value: value.night_value,
    });
  });

  const shifts = (shiftsRes.data ?? []) as ScheduleShift[];

  const [assignmentsRes, offersRes, resolutionsRes] = await Promise.all([
    supabase.rpc('get_shift_assignments_range', {
      _tenant_id: tenantId,
      _start: startStr,
      _end: endStr,
    }),
    supabase.rpc('get_shift_offers_pending_range', {
      _tenant_id: tenantId,
      _start: startStr,
      _end: endStr,
    }),
    supabase
      .from('conflict_resolutions')
      .select('conflict_date, plantonista_id, conflict_details')
      .eq('tenant_id', tenantId)
      .gte('conflict_date', startStr)
      .lte('conflict_date', endStr),
  ]);

  if (assignmentsRes.error) {
    console.error('[adminScheduleData] get_shift_assignments_range failed', assignmentsRes.error);
  }
  if (offersRes.error) {
    console.error('[adminScheduleData] get_shift_offers_pending_range failed', offersRes.error);
  }
  if (resolutionsRes.error) {
    console.error('[adminScheduleData] conflict_resolutions fetch failed', resolutionsRes.error);
  }

  let assignments = ((assignmentsRes.data ?? []) as any[])
    .filter((row) => allowedUserIds.has(row.user_id))
    .map((row) => {
      const fallbackDisplayName = memberDisplayNameByUserId.get(row.user_id) ?? null;
      const resolvedFullName =
        row.full_name ?? (fallbackDisplayName && fallbackDisplayName !== row.name ? fallbackDisplayName : null);
      const resolvedName = resolvedFullName ?? row.name ?? fallbackDisplayName ?? null;
      return {
        id: row.id,
        shift_id: row.shift_id,
        user_id: row.user_id,
        assigned_value: row.assigned_value,
        status: row.status,
        profile: { name: resolvedName, full_name: resolvedFullName },
      };
    }) as ScheduleAssignment[];

  if (assignments.length === 0 && shifts.length > 0) {
    const { data: directAssignments, error: directAssignmentsError } = await supabase
      .from('shift_assignments')
      .select('id, shift_id, user_id, assigned_value, status, profile:profiles!shift_assignments_user_id_profiles_fkey(name, full_name)')
      .in('shift_id', shifts.map((shift) => shift.id));

    if (directAssignmentsError) {
      console.error('[adminScheduleData] shift_assignments fallback fetch failed', directAssignmentsError);
    } else {
      assignments = ((directAssignments ?? []) as any[])
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
        })) as ScheduleAssignment[];
    }
  }

  const offers = ((offersRes.data ?? []) as any[]).map((row) => {
    const fallbackDisplayName = memberDisplayNameByUserId.get(row.user_id) ?? null;
    const resolvedFullName =
      row.full_name ?? (fallbackDisplayName && fallbackDisplayName !== row.name ? fallbackDisplayName : null);
    const resolvedName = resolvedFullName ?? row.name ?? fallbackDisplayName ?? null;
    return {
      id: row.id,
      shift_id: row.shift_id,
      user_id: row.user_id,
      status: row.status,
      message: row.message,
      profile: { name: resolvedName, full_name: resolvedFullName },
    };
  }) as ScheduleOffer[];

  const acknowledgedConflictKeys = new Set<string>();
  for (const row of (resolutionsRes.data ?? []) as Array<{ conflict_date: string | null; plantonista_id: string | null; conflict_details: unknown }>) {
    const key = buildStoredConflictKey({
      plantonistaId: row.plantonista_id,
      conflictDate: row.conflict_date,
      conflictDetails: row.conflict_details,
    });
    if (key) {
      acknowledgedConflictKeys.add(key);
    }
  }

  return {
    startStr,
    endStr,
    sectors,
    sectorMemberships,
    members,
    userSectorValues,
    shifts,
    assignments,
    offers,
    acknowledgedConflictKeys,
  };
}
