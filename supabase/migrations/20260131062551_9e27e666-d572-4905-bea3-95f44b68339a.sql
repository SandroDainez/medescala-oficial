-- Fix security issue: shifts with NULL sector_id should only be visible to privileged users
-- Remove the condition that allows all tenant members to see unassigned shifts

CREATE OR REPLACE FUNCTION public.can_view_shift(_shift_id uuid, _tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    -- GABS bypass (super_admin + GABS member)
    public.has_gabs_bypass(auth.uid())
    OR
    -- Global super admin
    public.is_super_admin(auth.uid())
    OR
    -- Tenant admin sees all shifts in their tenant
    public.is_tenant_admin(auth.uid(), _tenant_id)
    OR
    -- User is assigned to this shift
    public.is_assigned_to_shift(_shift_id, auth.uid())
    OR
    -- User is member of the shift's sector (sees ALL shifts in that sector)
    EXISTS (
      SELECT 1
      FROM public.shifts s
      JOIN public.sector_memberships sm ON sm.sector_id = s.sector_id 
                                        AND sm.tenant_id = s.tenant_id
      WHERE s.id = _shift_id
        AND sm.user_id = auth.uid()
    )
    -- REMOVED: Shifts without sector (NULL sector_id) visible to all tenant members
    -- Now only admins/super_admins can see shifts with NULL sector_id
  )
$function$;