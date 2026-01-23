-- Table to store sector revenues (fixed and variable) per month
CREATE TABLE public.sector_revenues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  sector_id UUID NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  fixed_revenue NUMERIC NOT NULL DEFAULT 0,
  variable_revenue NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  UNIQUE(tenant_id, sector_id, month, year)
);

-- Table to store sector expenses per month
CREATE TABLE public.sector_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  sector_id UUID NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  expense_type TEXT NOT NULL CHECK (expense_type IN ('tax', 'general', 'specific')),
  expense_name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.sector_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sector_revenues
CREATE POLICY "Tenant admins can manage sector revenues"
ON public.sector_revenues
FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can view sector revenues"
ON public.sector_revenues
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

-- RLS Policies for sector_expenses
CREATE POLICY "Tenant admins can manage sector expenses"
ON public.sector_expenses
FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can view sector expenses"
ON public.sector_expenses
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

-- Indexes for faster queries
CREATE INDEX idx_sector_revenues_lookup ON public.sector_revenues(tenant_id, year, month);
CREATE INDEX idx_sector_expenses_lookup ON public.sector_expenses(tenant_id, sector_id, year, month);