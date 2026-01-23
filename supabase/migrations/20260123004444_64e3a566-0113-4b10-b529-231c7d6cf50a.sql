-- Create table for individual plantonista value overrides per sector
CREATE TABLE public.user_sector_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_value NUMERIC,
  night_value NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT unique_user_sector UNIQUE (tenant_id, sector_id, user_id)
);

-- Enable RLS
ALTER TABLE public.user_sector_values ENABLE ROW LEVEL SECURITY;

-- Tenant admins can manage user sector values
CREATE POLICY "Tenant admins can manage user sector values"
ON public.user_sector_values
FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- Tenant members can view their own sector values
CREATE POLICY "Users can view their own sector values"
ON public.user_sector_values
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id AND is_tenant_member(auth.uid(), tenant_id));

-- Create trigger for updated_at
CREATE TRIGGER update_user_sector_values_updated_at
BEFORE UPDATE ON public.user_sector_values
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();