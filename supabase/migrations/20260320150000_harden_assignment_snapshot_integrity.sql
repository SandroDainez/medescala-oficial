BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_shift_assignment_snapshot_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.shift_assignment_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Escritas estruturais em shift_assignments só podem ocorrer via RPC autorizada';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_shift_assignment_snapshot_write ON public.shift_assignments;

CREATE TRIGGER trg_enforce_shift_assignment_snapshot_write
BEFORE INSERT OR UPDATE OF shift_id, user_id, tenant_id, assigned_value, value_source, value_snapshot_meta, status
ON public.shift_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_shift_assignment_snapshot_write();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.status IN ('assigned', 'confirmed', 'completed')
    GROUP BY sa.shift_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem plantões com múltiplas assignments ativas. Resolva os conflitos antes de aplicar ux_shift_assignments_active_shift.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_shift_assignments_active_shift
  ON public.shift_assignments (shift_id)
  WHERE status IN ('assigned', 'confirmed', 'completed');

ALTER TABLE public.shift_assignments
  DROP CONSTRAINT IF EXISTS shift_assignments_assigned_value_nonnegative,
  DROP CONSTRAINT IF EXISTS shift_assignments_value_source_domain,
  DROP CONSTRAINT IF EXISTS shift_assignments_snapshot_pairing,
  DROP CONSTRAINT IF EXISTS shift_assignments_snapshot_meta_has_source,
  ADD CONSTRAINT shift_assignments_assigned_value_nonnegative
    CHECK (assigned_value IS NULL OR assigned_value >= 0) NOT VALID,
  ADD CONSTRAINT shift_assignments_value_source_domain
    CHECK (value_source IS NULL OR value_source IN ('manual', 'individual', 'shift_base', 'sector_default')) NOT VALID,
  ADD CONSTRAINT shift_assignments_snapshot_pairing
    CHECK (
      (assigned_value IS NULL AND value_source IS NULL)
      OR (assigned_value IS NOT NULL AND value_source IS NOT NULL)
    ) NOT VALID,
  ADD CONSTRAINT shift_assignments_snapshot_meta_has_source
    CHECK (assigned_value IS NULL OR value_snapshot_meta ? 'source') NOT VALID;

COMMENT ON FUNCTION public.enforce_shift_assignment_snapshot_write() IS
'Bloqueia inserts/updates estruturais em shift_assignments fora das RPCs que habilitam explicitamente o contexto de escrita.';

COMMIT;
