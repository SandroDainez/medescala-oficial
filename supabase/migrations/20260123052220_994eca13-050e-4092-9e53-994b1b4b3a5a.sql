-- Add reference coordinates to sectors for GPS proximity validation
ALTER TABLE public.sectors
ADD COLUMN IF NOT EXISTS reference_latitude numeric,
ADD COLUMN IF NOT EXISTS reference_longitude numeric;

-- Add comment for documentation
COMMENT ON COLUMN public.sectors.reference_latitude IS 'Latitude de referência do local de trabalho do setor';
COMMENT ON COLUMN public.sectors.reference_longitude IS 'Longitude de referência do local de trabalho do setor';