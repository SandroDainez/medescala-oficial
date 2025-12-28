-- Strengthen payments RLS with explicit tenant membership checks (no helper function dependency)

-- Ensure RLS is enabled
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (created previously)
DROP POLICY IF EXISTS "User can view own payments in tenant" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can view all payments in tenant" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can update payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admin can delete payments" ON public.payments;

-- User can view only their own payments, and only within tenants where they are active members
CREATE POLICY "User can view own payments in tenant"
ON public.payments
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = payments.tenant_id
      AND m.active = true
  )
);

-- Tenant admins can view all payments in their tenant
CREATE POLICY "Tenant admin can view all payments in tenant"
ON public.payments
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = payments.tenant_id
      AND m.role = 'admin'
      AND m.active = true
  )
);

-- Tenant admins can insert payments only for their tenant
CREATE POLICY "Tenant admin can insert payments"
ON public.payments
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = payments.tenant_id
      AND m.role = 'admin'
      AND m.active = true
  )
);

-- Tenant admins can update payments only for their tenant
CREATE POLICY "Tenant admin can update payments"
ON public.payments
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = payments.tenant_id
      AND m.role = 'admin'
      AND m.active = true
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = payments.tenant_id
      AND m.role = 'admin'
      AND m.active = true
  )
);

-- Tenant admins can delete payments only for their tenant
CREATE POLICY "Tenant admin can delete payments"
ON public.payments
FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = payments.tenant_id
      AND m.role = 'admin'
      AND m.active = true
  )
);
