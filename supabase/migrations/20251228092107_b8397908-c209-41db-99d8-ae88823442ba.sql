-- Fix 1: Make shifts.tenant_id NOT NULL to prevent cross-tenant exposure
-- First, update any existing null values (if any) - this will fail if there are orphan shifts
-- Then add NOT NULL constraint

-- Update shifts that might have null tenant_id (set to a valid one from the creator's membership)
UPDATE public.shifts s
SET tenant_id = (
  SELECT m.tenant_id 
  FROM public.memberships m 
  WHERE m.user_id = s.created_by AND m.active = true 
  LIMIT 1
)
WHERE s.tenant_id IS NULL AND s.created_by IS NOT NULL;

-- Delete any remaining shifts without tenant_id (orphan data)
DELETE FROM public.shifts WHERE tenant_id IS NULL;

-- Now make tenant_id NOT NULL
ALTER TABLE public.shifts 
ALTER COLUMN tenant_id SET NOT NULL;

-- Add CHECK constraint to ensure tenant_id is always set
ALTER TABLE public.shifts 
ADD CONSTRAINT shifts_tenant_id_not_empty CHECK (tenant_id IS NOT NULL);

-- Fix 2: Make shift_assignments.tenant_id NOT NULL as well for consistency
UPDATE public.shift_assignments sa
SET tenant_id = (
  SELECT s.tenant_id 
  FROM public.shifts s 
  WHERE s.id = sa.shift_id 
  LIMIT 1
)
WHERE sa.tenant_id IS NULL;

DELETE FROM public.shift_assignments WHERE tenant_id IS NULL;

ALTER TABLE public.shift_assignments 
ALTER COLUMN tenant_id SET NOT NULL;

-- Fix 3: Strengthen the can_admin_access_profile function with additional tenant isolation check
CREATE OR REPLACE FUNCTION public.can_admin_access_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships admin_m
    JOIN public.memberships profile_m ON admin_m.tenant_id = profile_m.tenant_id
    WHERE admin_m.user_id = auth.uid()
      AND admin_m.role = 'admin'
      AND admin_m.active = true
      AND profile_m.user_id = _profile_id
      AND profile_m.active = true
      -- Additional check: ensure both memberships are in the same active tenant
      AND admin_m.tenant_id = profile_m.tenant_id
  )
$$;