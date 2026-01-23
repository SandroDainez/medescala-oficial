-- Create table to track conflict resolution history
CREATE TABLE public.conflict_resolutions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Conflict identification
  conflict_date DATE NOT NULL,
  plantonista_id UUID NOT NULL REFERENCES public.profiles(id),
  plantonista_name TEXT NOT NULL,
  
  -- Resolution type: 'acknowledged' (kept conflict with justification) or 'removed' (removed from one assignment)
  resolution_type TEXT NOT NULL CHECK (resolution_type IN ('acknowledged', 'removed')),
  
  -- For 'acknowledged': justification text
  justification TEXT,
  
  -- For 'removed': which assignment was removed and which was kept
  removed_sector_name TEXT,
  removed_shift_time TEXT,
  removed_assignment_id UUID,
  kept_sector_name TEXT,
  kept_shift_time TEXT,
  kept_assignment_id UUID,
  
  -- All conflicting shifts info (JSON for full context)
  conflict_details JSONB,
  
  -- Audit fields
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conflict_resolutions ENABLE ROW LEVEL SECURITY;

-- Tenant admins can manage conflict resolutions
CREATE POLICY "Tenant admins can manage conflict resolutions"
  ON public.conflict_resolutions
  FOR ALL
  USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- Create index for efficient querying
CREATE INDEX idx_conflict_resolutions_tenant_date ON public.conflict_resolutions(tenant_id, conflict_date);
CREATE INDEX idx_conflict_resolutions_plantonista ON public.conflict_resolutions(plantonista_id);