-- Fix payments table: ensure tenant_id is NOT NULL
-- First update any NULL tenant_ids based on user membership
UPDATE public.payments p
SET tenant_id = (
  SELECT m.tenant_id 
  FROM public.memberships m 
  WHERE m.user_id = p.user_id 
  AND m.active = true 
  LIMIT 1
)
WHERE p.tenant_id IS NULL;

-- Delete any orphaned payments that couldn't be assigned
DELETE FROM public.payments WHERE tenant_id IS NULL;

-- Make tenant_id NOT NULL
ALTER TABLE public.payments 
ALTER COLUMN tenant_id SET NOT NULL;

-- Add super_admins table RLS policies to prevent unauthorized modifications
-- Drop any existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Super admins can view super_admins table" ON public.super_admins;
DROP POLICY IF EXISTS "Only service role can insert super_admins" ON public.super_admins;
DROP POLICY IF EXISTS "Only service role can update super_admins" ON public.super_admins;
DROP POLICY IF EXISTS "Only service role can delete super_admins" ON public.super_admins;

-- Enable RLS if not already enabled
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Only super admins can view the table
CREATE POLICY "Super admins can view super_admins table"
ON public.super_admins
FOR SELECT
USING (is_super_admin());

-- No one can insert via client - only service role
CREATE POLICY "No client inserts to super_admins"
ON public.super_admins
FOR INSERT
WITH CHECK (false);

-- No one can update via client - only service role  
CREATE POLICY "No client updates to super_admins"
ON public.super_admins
FOR UPDATE
USING (false);

-- No one can delete via client - only service role
CREATE POLICY "No client deletes to super_admins"
ON public.super_admins
FOR DELETE
USING (false);