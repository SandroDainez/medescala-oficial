-- Create shift_offers table for plantonistas offering to take available shifts
CREATE TABLE public.shift_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  tenant_id UUID REFERENCES public.tenants(id),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(shift_id, user_id)
);

-- Enable RLS
ALTER TABLE public.shift_offers ENABLE ROW LEVEL SECURITY;

-- Policies for shift_offers
CREATE POLICY "Users can view offers for their tenant" 
ON public.shift_offers 
FOR SELECT 
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Users can create offers for available shifts" 
ON public.shift_offers 
FOR INSERT 
WITH CHECK (is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid());

CREATE POLICY "Users can cancel their own pending offers" 
ON public.shift_offers 
FOR DELETE 
USING (is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Tenant admins can manage all offers" 
ON public.shift_offers 
FOR ALL 
USING (is_tenant_admin(auth.uid(), tenant_id));

-- Add trigger for updated_at
CREATE TRIGGER update_shift_offers_updated_at
BEFORE UPDATE ON public.shift_offers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();