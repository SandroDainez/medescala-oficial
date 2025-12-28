-- Add default shift values to sectors table
ALTER TABLE public.sectors
ADD COLUMN default_day_value numeric DEFAULT NULL,
ADD COLUMN default_night_value numeric DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.sectors.default_day_value IS 'Valor padrão para plantões diurnos (7h-19h) deste setor';
COMMENT ON COLUMN public.sectors.default_night_value IS 'Valor padrão para plantões noturnos (19h-7h) deste setor';