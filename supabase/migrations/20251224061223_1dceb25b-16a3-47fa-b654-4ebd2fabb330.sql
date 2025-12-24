-- Create sectors table
CREATE TABLE public.sectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#22c55e',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  UNIQUE(tenant_id, name)
);

-- Enable RLS
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sectors
CREATE POLICY "Tenant members can view sectors"
ON public.sectors
FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage sectors"
ON public.sectors
FOR ALL
USING (is_tenant_admin(auth.uid(), tenant_id));

-- Create sector_memberships table (which users belong to which sectors)
CREATE TABLE public.sector_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(sector_id, user_id)
);

-- Enable RLS
ALTER TABLE public.sector_memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sector_memberships
CREATE POLICY "Tenant members can view sector memberships"
ON public.sector_memberships
FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage sector memberships"
ON public.sector_memberships
FOR ALL
USING (is_tenant_admin(auth.uid(), tenant_id));

-- Add sector_id to shifts table
ALTER TABLE public.shifts 
ADD COLUMN sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL;

-- Update trigger for timestamps
CREATE TRIGGER update_sectors_updated_at
BEFORE UPDATE ON public.sectors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_sectors_tenant_id ON public.sectors(tenant_id);
CREATE INDEX idx_sector_memberships_sector_id ON public.sector_memberships(sector_id);
CREATE INDEX idx_sector_memberships_user_id ON public.sector_memberships(user_id);
CREATE INDEX idx_shifts_sector_id ON public.shifts(sector_id);