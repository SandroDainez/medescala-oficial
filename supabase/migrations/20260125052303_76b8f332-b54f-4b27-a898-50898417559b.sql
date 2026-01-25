-- Add payment access permissions table (managed by super admins)
CREATE TABLE IF NOT EXISTS public.payment_access_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  granted_by uuid NULL,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text NULL,
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE public.payment_access_permissions ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage this list
DROP POLICY IF EXISTS "Super admins can manage payment access" ON public.payment_access_permissions;
CREATE POLICY "Super admins can manage payment access"
ON public.payment_access_permissions
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Helper function for payment access (security definer)
CREATE OR REPLACE FUNCTION public.has_payment_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
    )
  );
$$;

-- Update can_access_payment to reflect the new access model
CREATE OR REPLACE FUNCTION public.can_access_payment(_payment_tenant_id uuid, _payment_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    auth.uid() IS NOT NULL
    AND _payment_tenant_id IS NOT NULL
    AND (
      -- User can access their own payments if they are a member of that tenant
      (
        auth.uid() = _payment_user_id 
        AND EXISTS (
          SELECT 1 FROM public.memberships 
          WHERE user_id = auth.uid() 
            AND tenant_id = _payment_tenant_id 
            AND active = true
        )
      )
      OR
      -- Finance-authorized users (or super admins) can access payments in tenant
      public.has_payment_access(auth.uid(), _payment_tenant_id)
    );
$$;

-- Tighten payments table policies (remove tenant-wide admin visibility)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Remove old broad policies if present
DROP POLICY IF EXISTS "Tenant admin can view all tenant payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can update payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Block all anon access on payments" ON public.payments;

-- Defense-in-depth: block anon
CREATE POLICY "Block all anon access on payments"
ON public.payments
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Users: view their own payments (and must be tenant members)
CREATE POLICY "Users can view own payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND public.is_tenant_member(auth.uid(), tenant_id)
);

-- Finance-authorized users: view all payments in tenant
CREATE POLICY "Finance can view tenant payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.has_payment_access(auth.uid(), tenant_id)
);

-- Writes: allow tenant admins OR finance-authorized users
CREATE POLICY "Finance/admin can insert payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR public.has_payment_access(auth.uid(), tenant_id)
  )
);

CREATE POLICY "Finance/admin can update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR public.has_payment_access(auth.uid(), tenant_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR public.has_payment_access(auth.uid(), tenant_id)
  )
);

CREATE POLICY "Finance/admin can delete payments"
ON public.payments
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR public.has_payment_access(auth.uid(), tenant_id)
  )
);
