export type Money = number; // always in reais as number; only format in UI

export type FinancialValueSource = 'individual' | 'assigned' | 'base' | 'sector_default' | 'zero_individual' | 'zero_assigned' | 'zero_base' | 'none' | 'invalid';

export interface ScheduleShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_id: string | null;
  base_value: Money | null;
  title?: string | null;
  hospital?: string | null;
}

export interface ScheduleAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_value: Money | null;
  profile_name?: string | null;
}

export interface UserSectorValueLookup {
  sector_id: string;
  user_id: string;
  day_value: Money | null;
  night_value: Money | null;
}

export interface SectorLookup {
  id: string;
  name: string;
  default_day_value?: Money | null;
  default_night_value?: Money | null;
}

export interface FinancialEntry {
  /** unique row identifier for the entry in the report (assignment id if exists, otherwise shift id) */
  id: string;
  /** underlying shift id */
  shift_id: string;

  shift_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;

  sector_id: string | null;
  sector_name: string;

  assignee_id: string; // required for grouping; use "unassigned" when no assignee
  assignee_name: string;

  // convenience fields for UI tables
  title?: string | null;
  hospital?: string | null;

  assigned_value: Money | null;
  base_value: Money | null;

  final_value: Money | null;
  value_source: FinancialValueSource;
  value_invalid_reason?: string;
}

export interface AuditInfo {
  totalLoaded: number;
  withValue: number;
  withoutValue: number;
  invalidValue: number;
  includedIds: string[];
  sumDetails: { id: string; assignee_name: string; final_value: number }[];
  finalSum: number;
}
