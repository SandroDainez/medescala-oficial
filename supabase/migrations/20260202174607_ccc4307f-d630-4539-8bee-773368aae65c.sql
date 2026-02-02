-- Split the GPS location policy to enforce audited access for admin/grants
-- 1. Drop the combined policy
DROP POLICY IF EXISTS "Users can view own active shift locations" ON public.shift_assignment_locations;

-- 2. Create policy for users viewing ONLY their own recent locations
CREATE POLICY "Users can view own recent locations"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR SELECT
USING (
  is_tenant_member(auth.uid(), tenant_id) 
  AND user_id = auth.uid() 
  AND created_at > (now() - interval '12 hours')
);

-- 3. Admin/grant-holders MUST use get_assignment_location_with_audit() RPC
-- which already logs access to gps_access_logs table.
-- Direct SELECT is now blocked for non-owners.

-- Add comment explaining the security design
COMMENT ON POLICY "Users can view own recent locations" ON public.shift_assignment_locations IS 
'Users can only view their own GPS data from the last 12 hours. Admins and users with gps_access_grants MUST use get_assignment_location_with_audit() RPC which logs all access to gps_access_logs.';