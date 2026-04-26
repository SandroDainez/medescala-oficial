-- Security Advisor warning fix:
-- Set an explicit search_path for functions flagged as mutable.

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc AS p
    JOIN pg_namespace AS n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'claim_open_shift_with_snapshot',
        'accept_shift_offer_with_snapshot',
        'transfer_assignment_preserving_value',
        'override_assignment_value',
        'set_user_feedback_updated_at',
        'is_admin',
        'add_member',
        'add_member_to_tenant',
        'haversine_meters'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public', fn);
  END LOOP;
END;
$$;
