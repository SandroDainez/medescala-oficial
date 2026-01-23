-- Add sector_id to schedule_finalizations for per-sector finalization
ALTER TABLE public.schedule_finalizations 
ADD COLUMN sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE;

-- Drop the old unique constraint and create a new one that includes sector_id
ALTER TABLE public.schedule_finalizations DROP CONSTRAINT IF EXISTS schedule_finalizations_tenant_id_month_year_key;
ALTER TABLE public.schedule_finalizations 
ADD CONSTRAINT schedule_finalizations_tenant_sector_month_year_key UNIQUE (tenant_id, sector_id, month, year);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_schedule_finalizations_sector ON public.schedule_finalizations(sector_id);

-- Update the existing RLS policies to include sector-based access
DROP POLICY IF EXISTS "Tenant members can view schedule finalizations" ON public.schedule_finalizations;
DROP POLICY IF EXISTS "Tenant admins can manage schedule finalizations" ON public.schedule_finalizations;

CREATE POLICY "Tenant members can view schedule finalizations" 
ON public.schedule_finalizations 
FOR SELECT 
USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage schedule finalizations" 
ON public.schedule_finalizations 
FOR ALL 
USING (public.is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));