BEGIN;

-- Valores padrão diferenciados para plantões de fim de semana (sábado e domingo).
-- Diurno e noturno separados, espelhando default_day_value / default_night_value.
-- Colunas nulas: quando não preenchidas, o app cai no valor de dia útil correspondente.
ALTER TABLE public.sectors
  ADD COLUMN IF NOT EXISTS default_weekend_day_value numeric NULL,
  ADD COLUMN IF NOT EXISTS default_weekend_night_value numeric NULL;

COMMENT ON COLUMN public.sectors.default_weekend_day_value IS
  'Valor padrão diurno (7h-19h) para plantões de sábado/domingo. Nulo = usa default_day_value.';
COMMENT ON COLUMN public.sectors.default_weekend_night_value IS
  'Valor padrão noturno (19h-7h) para plantões de sábado/domingo. Nulo = usa default_night_value.';

COMMIT;
