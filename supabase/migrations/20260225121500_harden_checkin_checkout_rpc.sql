BEGIN;

-- Enforce check-in/check-out through audited RPCs only.
DROP POLICY IF EXISTS "Users can update their own checkin/checkout" ON public.shift_assignments;
DROP POLICY IF EXISTS "Users can update own checkin/checkout" ON public.shift_assignments;

CREATE OR REPLACE FUNCTION public.haversine_meters(
  _lat1 numeric,
  _lon1 numeric,
  _lat2 numeric,
  _lon2 numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2 * 6371000 * asin(
    sqrt(
      power(sin(radians((_lat2 - _lat1) / 2)), 2) +
      cos(radians(_lat1)) * cos(radians(_lat2)) *
      power(sin(radians((_lon2 - _lon1) / 2)), 2)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.perform_shift_checkin(
  _assignment_id uuid,
  _latitude numeric DEFAULT NULL,
  _longitude numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now timestamptz := now();
  v_now_local timestamp := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_assignment record;
  v_tolerance integer;
  v_radius numeric;
  v_distance numeric := NULL;
  v_start_ts timestamp;
  v_end_ts timestamp;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT
    sa.id,
    sa.user_id,
    sa.tenant_id,
    sa.checkin_at,
    sa.checkout_at,
    sa.status,
    s.shift_date,
    s.start_time,
    s.end_time,
    sec.checkin_enabled,
    sec.require_gps_checkin,
    sec.allowed_checkin_radius_meters,
    sec.checkin_tolerance_minutes,
    sec.reference_latitude,
    sec.reference_longitude
  INTO v_assignment
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  JOIN public.sectors sec ON sec.id = s.sector_id
  WHERE sa.id = _assignment_id
    AND sa.user_id = auth.uid()
  LIMIT 1;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Plantão não encontrado para este usuário';
  END IF;

  IF COALESCE(v_assignment.checkin_enabled, false) = false THEN
    RAISE EXCEPTION 'Check-in está desativado para este setor';
  END IF;

  IF v_assignment.checkin_at IS NOT NULL THEN
    RAISE EXCEPTION 'Check-in já registrado para este plantão';
  END IF;

  IF v_assignment.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Não é possível fazer check-in neste status';
  END IF;

  v_tolerance := GREATEST(COALESCE(v_assignment.checkin_tolerance_minutes, 30), 0);
  v_start_ts := (v_assignment.shift_date::text || ' ' || v_assignment.start_time::text)::timestamp;
  v_end_ts := (v_assignment.shift_date::text || ' ' || v_assignment.end_time::text)::timestamp;
  IF v_end_ts <= v_start_ts THEN
    v_end_ts := v_end_ts + interval '1 day';
  END IF;

  IF v_now_local < (v_start_ts - make_interval(mins => v_tolerance))
     OR v_now_local > (v_end_ts + make_interval(mins => v_tolerance)) THEN
    RAISE EXCEPTION 'Fora da janela permitida de check-in';
  END IF;

  IF COALESCE(v_assignment.require_gps_checkin, false) THEN
    IF _latitude IS NULL OR _longitude IS NULL THEN
      RAISE EXCEPTION 'Este setor exige GPS para check-in';
    END IF;

    IF v_assignment.reference_latitude IS NULL OR v_assignment.reference_longitude IS NULL THEN
      RAISE EXCEPTION 'Setor sem coordenadas de referência configuradas';
    END IF;

    v_radius := COALESCE(v_assignment.allowed_checkin_radius_meters, 500);
    v_distance := public.haversine_meters(_latitude, _longitude, v_assignment.reference_latitude, v_assignment.reference_longitude);

    IF v_distance > v_radius THEN
      RAISE EXCEPTION 'Fora do raio permitido para check-in (distância: %m, permitido: %m)', round(v_distance), round(v_radius);
    END IF;
  END IF;

  PERFORM set_config('app.bypass_restrict_user_assignment_update', 'true', true);
  UPDATE public.shift_assignments
  SET
    checkin_at = v_now,
    status = CASE WHEN status IN ('assigned', 'pending') THEN 'confirmed' ELSE status END,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = v_assignment.id
    AND user_id = auth.uid();
  PERFORM set_config('app.bypass_restrict_user_assignment_update', 'false', true);

  IF _latitude IS NOT NULL AND _longitude IS NOT NULL THEN
    INSERT INTO public.shift_assignment_locations (
      assignment_id,
      tenant_id,
      user_id,
      checkin_latitude,
      checkin_longitude
    ) VALUES (
      v_assignment.id,
      v_assignment.tenant_id,
      auth.uid(),
      _latitude,
      _longitude
    )
    ON CONFLICT (assignment_id)
    DO UPDATE SET
      checkin_latitude = EXCLUDED.checkin_latitude,
      checkin_longitude = EXCLUDED.checkin_longitude,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'checkin_at', v_now,
    'distance_meters', COALESCE(round(v_distance), null)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.perform_shift_checkout(
  _assignment_id uuid,
  _latitude numeric DEFAULT NULL,
  _longitude numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now timestamptz := now();
  v_assignment record;
  v_radius numeric;
  v_distance numeric := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT
    sa.id,
    sa.user_id,
    sa.tenant_id,
    sa.checkin_at,
    sa.checkout_at,
    sa.status,
    sec.checkin_enabled,
    sec.require_gps_checkin,
    sec.allowed_checkin_radius_meters,
    sec.reference_latitude,
    sec.reference_longitude
  INTO v_assignment
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  JOIN public.sectors sec ON sec.id = s.sector_id
  WHERE sa.id = _assignment_id
    AND sa.user_id = auth.uid()
  LIMIT 1;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Plantão não encontrado para este usuário';
  END IF;

  IF COALESCE(v_assignment.checkin_enabled, false) = false THEN
    RAISE EXCEPTION 'Check-in está desativado para este setor';
  END IF;

  IF v_assignment.checkin_at IS NULL THEN
    RAISE EXCEPTION 'Check-in não registrado para este plantão';
  END IF;

  IF v_assignment.checkout_at IS NOT NULL THEN
    RAISE EXCEPTION 'Check-out já registrado para este plantão';
  END IF;

  IF COALESCE(v_assignment.require_gps_checkin, false) THEN
    IF _latitude IS NULL OR _longitude IS NULL THEN
      RAISE EXCEPTION 'Este setor exige GPS para check-out';
    END IF;

    IF v_assignment.reference_latitude IS NULL OR v_assignment.reference_longitude IS NULL THEN
      RAISE EXCEPTION 'Setor sem coordenadas de referência configuradas';
    END IF;

    v_radius := COALESCE(v_assignment.allowed_checkin_radius_meters, 500);
    v_distance := public.haversine_meters(_latitude, _longitude, v_assignment.reference_latitude, v_assignment.reference_longitude);

    IF v_distance > v_radius THEN
      RAISE EXCEPTION 'Fora do raio permitido para check-out (distância: %m, permitido: %m)', round(v_distance), round(v_radius);
    END IF;
  END IF;

  PERFORM set_config('app.bypass_restrict_user_assignment_update', 'true', true);
  UPDATE public.shift_assignments
  SET
    checkout_at = v_now,
    status = 'completed',
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = v_assignment.id
    AND user_id = auth.uid();
  PERFORM set_config('app.bypass_restrict_user_assignment_update', 'false', true);

  IF _latitude IS NOT NULL AND _longitude IS NOT NULL THEN
    INSERT INTO public.shift_assignment_locations (
      assignment_id,
      tenant_id,
      user_id,
      checkout_latitude,
      checkout_longitude
    ) VALUES (
      v_assignment.id,
      v_assignment.tenant_id,
      auth.uid(),
      _latitude,
      _longitude
    )
    ON CONFLICT (assignment_id)
    DO UPDATE SET
      checkout_latitude = EXCLUDED.checkout_latitude,
      checkout_longitude = EXCLUDED.checkout_longitude,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'checkout_at', v_now,
    'distance_meters', COALESCE(round(v_distance), null)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.perform_shift_checkin(uuid, numeric, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.perform_shift_checkout(uuid, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.perform_shift_checkin(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_shift_checkout(uuid, numeric, numeric) TO authenticated;

COMMIT;
