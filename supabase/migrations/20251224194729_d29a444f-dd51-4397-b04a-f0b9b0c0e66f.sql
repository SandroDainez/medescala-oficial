-- Tabela de ausências (faltas e afastamentos)
CREATE TABLE public.absences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('falta', 'atestado', 'licenca', 'ferias', 'outro')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their absences in tenant"
ON public.absences FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid());

CREATE POLICY "Tenant admins can manage all absences"
ON public.absences FOR ALL
USING (is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Users can create their own absence requests"
ON public.absences FOR INSERT
WITH CHECK (is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_absences_updated_at
BEFORE UPDATE ON public.absences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar campos de GPS no check-in/check-out na tabela shift_assignments
ALTER TABLE public.shift_assignments
ADD COLUMN checkin_latitude DECIMAL(10, 8),
ADD COLUMN checkin_longitude DECIMAL(11, 8),
ADD COLUMN checkout_latitude DECIMAL(10, 8),
ADD COLUMN checkout_longitude DECIMAL(11, 8);

-- Adicionar configuração de GPS obrigatório por setor
ALTER TABLE public.sectors
ADD COLUMN require_gps_checkin BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN allowed_checkin_radius_meters INTEGER DEFAULT 500;

-- Índices para performance
CREATE INDEX idx_absences_tenant_id ON public.absences(tenant_id);
CREATE INDEX idx_absences_user_id ON public.absences(user_id);
CREATE INDEX idx_absences_dates ON public.absences(start_date, end_date);