-- Add month and year columns to user_sector_values for temporal scoping
ALTER TABLE public.user_sector_values 
ADD COLUMN month integer,
ADD COLUMN year integer;

-- Create index for efficient lookups by tenant, sector, user, month, year
CREATE INDEX idx_user_sector_values_temporal 
ON public.user_sector_values(tenant_id, sector_id, user_id, month, year);

-- Update the unique constraint to include month and year
-- First drop the existing constraint
ALTER TABLE public.user_sector_values 
DROP CONSTRAINT IF EXISTS user_sector_values_tenant_id_sector_id_user_id_key;

-- Create new unique constraint including month and year
ALTER TABLE public.user_sector_values 
ADD CONSTRAINT user_sector_values_tenant_sector_user_month_year_key 
UNIQUE (tenant_id, sector_id, user_id, month, year);