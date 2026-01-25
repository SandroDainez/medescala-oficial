-- =====================================================
-- FIX: Ensure all sensitive tables explicitly block anon access
-- The scanner may not recognize RESTRICTIVE policies without explicit TO clause
-- =====================================================

-- 1. PROFILES TABLE
-- Drop existing anon block policy and recreate with explicit TO anon
DROP POLICY IF EXISTS "Block all anon access on profiles" ON public.profiles;

CREATE POLICY "Block anon access on profiles"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 2. PROFILES_PRIVATE TABLE
DROP POLICY IF EXISTS "Block all anon access on profiles_private" ON public.profiles_private;

CREATE POLICY "Block anon access on profiles_private"
ON public.profiles_private
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 3. PAYMENTS TABLE
DROP POLICY IF EXISTS "Block all anon access on payments" ON public.payments;

CREATE POLICY "Block anon access on payments"
ON public.payments
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 4. SHIFT_ASSIGNMENT_LOCATIONS TABLE
DROP POLICY IF EXISTS "Block all anon access on shift_assignment_locations" ON public.shift_assignment_locations;

CREATE POLICY "Block anon access on shift_assignment_locations"
ON public.shift_assignment_locations
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 5. SHIFTS TABLE
DROP POLICY IF EXISTS "Block all anon access on shifts" ON public.shifts;

CREATE POLICY "Block anon access on shifts"
ON public.shifts
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 6. PLANS TABLE (also sensitive)
DROP POLICY IF EXISTS "Block all anon access on plans" ON public.plans;

CREATE POLICY "Block anon access on plans"
ON public.plans
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 7. TENANTS TABLE
DROP POLICY IF EXISTS "Block all anon access on tenants" ON public.tenants;

CREATE POLICY "Block anon access on tenants"
ON public.tenants
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 8. SHIFT_ASSIGNMENTS TABLE (contains assigned values)
DROP POLICY IF EXISTS "Block anon access on shift_assignments" ON public.shift_assignments;

CREATE POLICY "Block anon access on shift_assignments"
ON public.shift_assignments
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 9. SHIFT_ENTRIES TABLE (financial data)
DROP POLICY IF EXISTS "Block anon access on shift_entries" ON public.shift_entries;

CREATE POLICY "Block anon access on shift_entries"
ON public.shift_entries
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 10. NOTIFICATIONS TABLE
DROP POLICY IF EXISTS "Block anon access on notifications" ON public.notifications;

CREATE POLICY "Block anon access on notifications"
ON public.notifications
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 11. SECTORS TABLE
DROP POLICY IF EXISTS "Block anon access on sectors" ON public.sectors;

CREATE POLICY "Block anon access on sectors"
ON public.sectors
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 12. USER_ROLES TABLE
DROP POLICY IF EXISTS "Block anon access on user_roles" ON public.user_roles;

CREATE POLICY "Block anon access on user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 13. MEMBERSHIPS TABLE
DROP POLICY IF EXISTS "Block anon access on memberships" ON public.memberships;

CREATE POLICY "Block anon access on memberships"
ON public.memberships
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 14. ABSENCES TABLE
DROP POLICY IF EXISTS "Block all anon access on absences" ON public.absences;

CREATE POLICY "Block anon access on absences"
ON public.absences
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 15. GPS_ACCESS_LOGS TABLE
DROP POLICY IF EXISTS "Block all anon access on gps_access_logs" ON public.gps_access_logs;

CREATE POLICY "Block anon access on gps_access_logs"
ON public.gps_access_logs
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 16. SWAP_REQUESTS TABLE
DROP POLICY IF EXISTS "Block anon access on swap_requests" ON public.swap_requests;

CREATE POLICY "Block anon access on swap_requests"
ON public.swap_requests
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 17. SHIFT_OFFERS TABLE
DROP POLICY IF EXISTS "Block anon access on shift_offers" ON public.shift_offers;

CREATE POLICY "Block anon access on shift_offers"
ON public.shift_offers
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 18. USER_SECTOR_VALUES TABLE
DROP POLICY IF EXISTS "Block anon access on user_sector_values" ON public.user_sector_values;

CREATE POLICY "Block anon access on user_sector_values"
ON public.user_sector_values
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 19. SECTOR_MEMBERSHIPS TABLE
DROP POLICY IF EXISTS "Block anon access on sector_memberships" ON public.sector_memberships;

CREATE POLICY "Block anon access on sector_memberships"
ON public.sector_memberships
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 20. SECTOR_REVENUES TABLE
DROP POLICY IF EXISTS "Block anon access on sector_revenues" ON public.sector_revenues;

CREATE POLICY "Block anon access on sector_revenues"
ON public.sector_revenues
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 21. SECTOR_EXPENSES TABLE
DROP POLICY IF EXISTS "Block anon access on sector_expenses" ON public.sector_expenses;

CREATE POLICY "Block anon access on sector_expenses"
ON public.sector_expenses
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 22. SCHEDULE_FINALIZATIONS TABLE
DROP POLICY IF EXISTS "Block anon access on schedule_finalizations" ON public.schedule_finalizations;

CREATE POLICY "Block anon access on schedule_finalizations"
ON public.schedule_finalizations
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 23. SCHEDULE_MOVEMENTS TABLE
DROP POLICY IF EXISTS "Block anon access on schedule_movements" ON public.schedule_movements;

CREATE POLICY "Block anon access on schedule_movements"
ON public.schedule_movements
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 24. CONFLICT_RESOLUTIONS TABLE
DROP POLICY IF EXISTS "Block anon access on conflict_resolutions" ON public.conflict_resolutions;

CREATE POLICY "Block anon access on conflict_resolutions"
ON public.conflict_resolutions
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 25. PII_ACCESS_PERMISSIONS TABLE
DROP POLICY IF EXISTS "Block anon access on pii_access_permissions" ON public.pii_access_permissions;

CREATE POLICY "Block anon access on pii_access_permissions"
ON public.pii_access_permissions
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 26. PAYMENT_ACCESS_PERMISSIONS TABLE
DROP POLICY IF EXISTS "Block anon access on payment_access_permissions" ON public.payment_access_permissions;

CREATE POLICY "Block anon access on payment_access_permissions"
ON public.payment_access_permissions
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 27. PII_AUDIT_LOGS TABLE
DROP POLICY IF EXISTS "Block anon access on pii_audit_logs" ON public.pii_audit_logs;

CREATE POLICY "Block anon access on pii_audit_logs"
ON public.pii_audit_logs
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 28. SYSTEM_SETTINGS TABLE
DROP POLICY IF EXISTS "Block anon access on system_settings" ON public.system_settings;

CREATE POLICY "Block anon access on system_settings"
ON public.system_settings
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 29. SUPER_ADMINS TABLE
DROP POLICY IF EXISTS "Block anon access on super_admins" ON public.super_admins;

CREATE POLICY "Block anon access on super_admins"
ON public.super_admins
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 30. LOGIN_CPF_RATE_LIMITS TABLE (already blocked but ensure consistency)
DROP POLICY IF EXISTS "No client access to login_cpf_rate_limits" ON public.login_cpf_rate_limits;

CREATE POLICY "Block anon access on login_cpf_rate_limits"
ON public.login_cpf_rate_limits
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Block authenticated access on login_cpf_rate_limits"
ON public.login_cpf_rate_limits
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);