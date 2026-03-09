-- Prevent non-plantonista users from being assigned to shifts.
-- This enforces business rule at DB layer to avoid admin appearing in scale/financial.

CREATE OR REPLACE FUNCTION public.enforce_plantonista_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_type text;
BEGIN
  SELECT p.profile_type
    INTO v_profile_type
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  IF COALESCE(v_profile_type, 'plantonista') <> 'plantonista' THEN
    RAISE EXCEPTION 'Somente usuários com perfil plantonista podem ser atribuídos à escala';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plantonista_assignment ON public.shift_assignments;

CREATE TRIGGER trg_enforce_plantonista_assignment
BEFORE INSERT OR UPDATE OF user_id
ON public.shift_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_plantonista_assignment();

