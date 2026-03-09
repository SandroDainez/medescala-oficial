-- Cleanup legacy assigned_value values that should be derived from individual rules.
-- If there is an individual config row (monthly or global) for that user/sector,
-- assigned_value must stay NULL so UI/Financeiro derives correctly (including zero).

UPDATE public.shift_assignments sa
SET assigned_value = NULL,
    updated_at = now()
FROM public.shifts s
WHERE s.id = sa.shift_id
  AND s.tenant_id = sa.tenant_id
  AND sa.assigned_value IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_sector_values uv
    WHERE uv.tenant_id = sa.tenant_id
      AND uv.user_id = sa.user_id
      AND uv.sector_id = s.sector_id
      AND (
        (uv.month = EXTRACT(MONTH FROM s.shift_date)::int AND uv.year = EXTRACT(YEAR FROM s.shift_date)::int)
        OR (uv.month IS NULL AND uv.year IS NULL)
      )
  );
