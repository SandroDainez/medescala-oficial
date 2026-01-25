-- Remove old unique constraint that doesn't include month/year
ALTER TABLE public.user_sector_values 
DROP CONSTRAINT IF EXISTS unique_user_sector;

-- Ensure the new constraint with temporal columns exists
-- (this may already exist from previous migration, so use IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_sector_values_tenant_sector_user_month_year_key'
  ) THEN
    ALTER TABLE public.user_sector_values 
    ADD CONSTRAINT user_sector_values_tenant_sector_user_month_year_key 
    UNIQUE (tenant_id, sector_id, user_id, month, year);
  END IF;
END $$;