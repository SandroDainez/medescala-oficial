-- Create tenants table (hospitals)
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create memberships table (replaces user_roles for multi-tenant)
CREATE TABLE public.memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- Add tenant_id to operational tables
ALTER TABLE public.shifts ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.shift_assignments ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.swap_requests ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Enable RLS on new tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check tenant membership
CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND active = true
  )
$$;

-- Create security definer function to check tenant admin
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role = 'admin'
      AND active = true
  )
$$;

-- Create function to get user's tenants
CREATE OR REPLACE FUNCTION public.get_user_tenants(_user_id UUID)
RETURNS TABLE(tenant_id UUID, tenant_name TEXT, role app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.tenant_id, t.name, m.role
  FROM public.memberships m
  JOIN public.tenants t ON t.id = m.tenant_id
  WHERE m.user_id = _user_id AND m.active = true
$$;

-- RLS Policies for tenants
CREATE POLICY "Users can view tenants they belong to"
ON public.tenants FOR SELECT
USING (is_tenant_member(auth.uid(), id));

CREATE POLICY "Tenant admins can update their tenant"
ON public.tenants FOR UPDATE
USING (is_tenant_admin(auth.uid(), id));

CREATE POLICY "Authenticated users can create tenants"
ON public.tenants FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for memberships
CREATE POLICY "Users can view memberships in their tenants"
ON public.memberships FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage memberships"
ON public.memberships FOR ALL
USING (is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Users can insert their own membership when creating tenant"
ON public.memberships FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Drop old RLS policies on operational tables and create new multi-tenant ones

-- Shifts policies
DROP POLICY IF EXISTS "Admins can manage all shifts" ON public.shifts;
DROP POLICY IF EXISTS "Users can view all shifts" ON public.shifts;

CREATE POLICY "Tenant members can view shifts"
ON public.shifts FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage shifts"
ON public.shifts FOR ALL
USING (is_tenant_admin(auth.uid(), tenant_id));

-- Shift assignments policies
DROP POLICY IF EXISTS "Admins can manage all assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Users can view their own assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Users can update their own checkin/checkout" ON public.shift_assignments;

CREATE POLICY "Users can view their assignments in tenant"
ON public.shift_assignments FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid());

CREATE POLICY "Tenant admins can manage all assignments"
ON public.shift_assignments FOR ALL
USING (is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Users can update their own checkin/checkout"
ON public.shift_assignments FOR UPDATE
USING (is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid());

-- Swap requests policies
DROP POLICY IF EXISTS "Admins can manage all swap requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Users can view their own swap requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Users can create swap requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Users can update their own pending requests" ON public.swap_requests;

CREATE POLICY "Users can view swap requests in tenant"
ON public.swap_requests FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) AND (requester_id = auth.uid() OR target_user_id = auth.uid()));

CREATE POLICY "Users can create swap requests in tenant"
ON public.swap_requests FOR INSERT
WITH CHECK (is_tenant_member(auth.uid(), tenant_id) AND requester_id = auth.uid());

CREATE POLICY "Users can update their pending requests"
ON public.swap_requests FOR UPDATE
USING (is_tenant_member(auth.uid(), tenant_id) AND requester_id = auth.uid() AND status = 'pending');

CREATE POLICY "Tenant admins can manage all swap requests"
ON public.swap_requests FOR ALL
USING (is_tenant_admin(auth.uid(), tenant_id));

-- Payments policies
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;

CREATE POLICY "Users can view their payments in tenant"
ON public.payments FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid());

CREATE POLICY "Tenant admins can manage all payments"
ON public.payments FOR ALL
USING (is_tenant_admin(auth.uid(), tenant_id));

-- Add triggers for updated_at
CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_memberships_updated_at
BEFORE UPDATE ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();