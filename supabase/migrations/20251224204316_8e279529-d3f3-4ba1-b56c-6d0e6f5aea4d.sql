-- Fix search_path for calculate_trial_end_date function
CREATE OR REPLACE FUNCTION public.calculate_trial_end_date()
RETURNS timestamp with time zone
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 second')::timestamp with time zone
$$;