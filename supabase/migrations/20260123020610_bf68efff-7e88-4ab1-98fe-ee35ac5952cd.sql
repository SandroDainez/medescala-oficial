-- Table to track when a schedule is finalized
CREATE TABLE public.schedule_finalizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  finalized_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finalized_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, month, year)
);

-- Table to track movements after schedule finalization
CREATE TABLE public.schedule_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('transferred', 'removed', 'added')),
  -- Source info (where removed from)
  source_sector_id UUID,
  source_sector_name TEXT,
  source_shift_date DATE,
  source_shift_time TEXT,
  source_assignment_id UUID,
  -- Destination info (where moved to, if applicable)
  destination_sector_id UUID,
  destination_sector_name TEXT,
  destination_shift_date DATE,
  destination_shift_time TEXT,
  destination_assignment_id UUID,
  -- Metadata
  reason TEXT,
  performed_by UUID NOT NULL,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.schedule_finalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for schedule_finalizations
CREATE POLICY "Tenant admins can manage schedule finalizations"
ON public.schedule_finalizations
FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can view schedule finalizations"
ON public.schedule_finalizations
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

-- RLS Policies for schedule_movements
CREATE POLICY "Tenant admins can manage schedule movements"
ON public.schedule_movements
FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can view schedule movements"
ON public.schedule_movements
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

-- Index for faster queries
CREATE INDEX idx_schedule_finalizations_tenant_month ON public.schedule_finalizations(tenant_id, year, month);
CREATE INDEX idx_schedule_movements_tenant_month ON public.schedule_movements(tenant_id, year, month);
CREATE INDEX idx_schedule_movements_user ON public.schedule_movements(user_id);