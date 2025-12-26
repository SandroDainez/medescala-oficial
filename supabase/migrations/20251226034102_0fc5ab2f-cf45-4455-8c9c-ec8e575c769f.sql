-- Fix RLS policies: Convert all RESTRICTIVE policies to PERMISSIVE
-- This ensures proper access control

-- =====================================================
-- TABLE: profiles_private
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can update private profiles in their tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Tenant admins can view private profiles in their tenant" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can update their own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can upsert their own private profile" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can view their own private profile" ON public.profiles_private;

CREATE POLICY "Users can view their own private profile"
ON public.profiles_private FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can upsert their own private profile"
ON public.profiles_private FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can update their own private profile"
ON public.profiles_private FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Tenant admins can view private profiles in their tenant"
ON public.profiles_private FOR SELECT
USING (auth.uid() IS NOT NULL AND can_admin_access_profile(user_id));

CREATE POLICY "Tenant admins can update private profiles in their tenant"
ON public.profiles_private FOR UPDATE
USING (auth.uid() IS NOT NULL AND can_admin_access_profile(user_id));

-- =====================================================
-- TABLE: profiles
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can insert profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can update profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant admins can view profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Tenant admins can view profiles in their tenant"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL AND can_admin_access_profile(id));

CREATE POLICY "Tenant admins can insert profiles in their tenant"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND can_admin_access_profile(id));

CREATE POLICY "Tenant admins can update profiles in their tenant"
ON public.profiles FOR UPDATE
USING (auth.uid() IS NOT NULL AND can_admin_access_profile(id));

-- =====================================================
-- TABLE: shifts
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage shifts" ON public.shifts;
DROP POLICY IF EXISTS "Tenant members can view shifts" ON public.shifts;

CREATE POLICY "Tenant members can view shifts"
ON public.shifts FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage shifts"
ON public.shifts FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: memberships
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage memberships" ON public.memberships;
DROP POLICY IF EXISTS "Users can insert their own membership when creating tenant" ON public.memberships;
DROP POLICY IF EXISTS "Users can view memberships in their tenants" ON public.memberships;

CREATE POLICY "Users can view memberships in their tenants"
ON public.memberships FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Users can insert their own membership when creating tenant"
ON public.memberships FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Tenant admins can manage memberships"
ON public.memberships FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: payments
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant admins can view payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;

CREATE POLICY "Users can view their own payments"
ON public.payments FOR SELECT
USING (auth.uid() IS NOT NULL AND user_id = auth.uid() AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can view payments"
ON public.payments FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can insert payments"
ON public.payments FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can update payments"
ON public.payments FOR UPDATE
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can delete payments"
ON public.payments FOR DELETE
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: shift_assignments
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage all assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Tenant admins can view all shift assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Tenant members can view basic shift assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Users can update their own checkin/checkout" ON public.shift_assignments;
DROP POLICY IF EXISTS "Users can view their own shift assignments" ON public.shift_assignments;

CREATE POLICY "Users can view their own shift assignments"
ON public.shift_assignments FOR SELECT
USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Users can update their own checkin/checkout"
ON public.shift_assignments FOR UPDATE
USING (auth.uid() IS NOT NULL AND user_id = auth.uid() AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage all assignments"
ON public.shift_assignments FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: shift_assignment_locations
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage assignment locations" ON public.shift_assignment_locations;
DROP POLICY IF EXISTS "Users can update their own assignment locations" ON public.shift_assignment_locations;
DROP POLICY IF EXISTS "Users can upsert their own assignment locations" ON public.shift_assignment_locations;
DROP POLICY IF EXISTS "Users can view their own assignment locations" ON public.shift_assignment_locations;

CREATE POLICY "Users can view their own assignment locations"
ON public.shift_assignment_locations FOR SELECT
USING (auth.uid() IS NOT NULL AND user_id = auth.uid() AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Users can upsert their own assignment locations"
ON public.shift_assignment_locations FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid() AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Users can update their own assignment locations"
ON public.shift_assignment_locations FOR UPDATE
USING (auth.uid() IS NOT NULL AND user_id = auth.uid() AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage assignment locations"
ON public.shift_assignment_locations FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: absences
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage all absences" ON public.absences;
DROP POLICY IF EXISTS "Users can create their own absence requests" ON public.absences;
DROP POLICY IF EXISTS "Users can view their absences in tenant" ON public.absences;

CREATE POLICY "Users can view their absences in tenant"
ON public.absences FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid());

CREATE POLICY "Users can create their own absence requests"
ON public.absences FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid());

CREATE POLICY "Tenant admins can manage all absences"
ON public.absences FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: notifications
-- =====================================================
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Tenant admins can manage all notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Tenant members can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage all notifications"
ON public.notifications FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: sectors
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage sectors" ON public.sectors;
DROP POLICY IF EXISTS "Tenant members can view sectors" ON public.sectors;

CREATE POLICY "Tenant members can view sectors"
ON public.sectors FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage sectors"
ON public.sectors FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: shift_entries
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage shift entries" ON public.shift_entries;
DROP POLICY IF EXISTS "Users can view their own shift entries" ON public.shift_entries;

CREATE POLICY "Users can view their own shift entries"
ON public.shift_entries FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = plantonista_id);

CREATE POLICY "Tenant admins can manage shift entries"
ON public.shift_entries FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: user_roles
-- =====================================================
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;

CREATE POLICY "Users can view their own role"
ON public.user_roles FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- TABLE: sector_memberships
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage sector memberships" ON public.sector_memberships;
DROP POLICY IF EXISTS "Tenant members can view sector memberships" ON public.sector_memberships;

CREATE POLICY "Tenant members can view sector memberships"
ON public.sector_memberships FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage sector memberships"
ON public.sector_memberships FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: shift_offers
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage all offers" ON public.shift_offers;
DROP POLICY IF EXISTS "Users can cancel their own pending offers" ON public.shift_offers;
DROP POLICY IF EXISTS "Users can create offers for available shifts" ON public.shift_offers;
DROP POLICY IF EXISTS "Users can view offers for their tenant" ON public.shift_offers;

CREATE POLICY "Users can view offers for their tenant"
ON public.shift_offers FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Users can create offers for available shifts"
ON public.shift_offers FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid());

CREATE POLICY "Users can cancel their own pending offers"
ON public.shift_offers FOR DELETE
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id) AND user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Tenant admins can manage all offers"
ON public.shift_offers FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: swap_requests
-- =====================================================
DROP POLICY IF EXISTS "Tenant admins can manage all swap requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Users can create swap requests in tenant" ON public.swap_requests;
DROP POLICY IF EXISTS "Users can update their pending requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Users can view swap requests in tenant" ON public.swap_requests;

CREATE POLICY "Users can view swap requests in tenant"
ON public.swap_requests FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id) AND (requester_id = auth.uid() OR target_user_id = auth.uid()));

CREATE POLICY "Users can create swap requests in tenant"
ON public.swap_requests FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id) AND requester_id = auth.uid());

CREATE POLICY "Users can update their pending requests"
ON public.swap_requests FOR UPDATE
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id) AND requester_id = auth.uid() AND status = 'pending');

CREATE POLICY "Tenant admins can manage all swap requests"
ON public.swap_requests FOR ALL
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- TABLE: tenants
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can create tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant admins can update their tenant" ON public.tenants;
DROP POLICY IF EXISTS "Users can view tenants they belong to" ON public.tenants;

CREATE POLICY "Users can view tenants they belong to"
ON public.tenants FOR SELECT
USING (auth.uid() IS NOT NULL AND is_tenant_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create tenants"
ON public.tenants FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Tenant admins can update their tenant"
ON public.tenants FOR UPDATE
USING (auth.uid() IS NOT NULL AND is_tenant_admin(auth.uid(), id));

-- =====================================================
-- TABLE: plans (keep as is - public viewing is intentional)
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.plans;

CREATE POLICY "Anyone can view active plans"
ON public.plans FOR SELECT
USING (active = true);