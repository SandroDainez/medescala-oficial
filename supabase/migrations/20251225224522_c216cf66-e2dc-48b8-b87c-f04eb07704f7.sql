-- Normalize monetary fields so "Sem valor" is represented by NULL (not 0)

-- 1) shift_assignments.assigned_value: allow NULL and remove default 0
ALTER TABLE public.shift_assignments
  ALTER COLUMN assigned_value DROP DEFAULT,
  ALTER COLUMN assigned_value DROP NOT NULL;

-- 2) shifts.base_value: allow NULL and remove default 0
ALTER TABLE public.shifts
  ALTER COLUMN base_value DROP DEFAULT,
  ALTER COLUMN base_value DROP NOT NULL;

-- 3) Backfill: convert 0 to NULL (treat 0 as 'unpriced' legacy value)
UPDATE public.shift_assignments
SET assigned_value = NULL
WHERE assigned_value = 0;

UPDATE public.shifts
SET base_value = NULL
WHERE base_value = 0;

-- 4) Helpful indexes for reporting performance
CREATE INDEX IF NOT EXISTS idx_shift_assignments_tenant_user_shift
  ON public.shift_assignments (tenant_id, user_id, shift_id);

CREATE INDEX IF NOT EXISTS idx_shifts_tenant_date
  ON public.shifts (tenant_id, shift_date);
