-- =====================================================
-- SECURITY HARDENING: Add missing DELETE policies and tighten cross-tenant checks
-- =====================================================

-- PROFILES_PRIVATE: allow deletion by owner or tenant admin(s) who can access that profile
DROP POLICY IF EXISTS "Users can delete their own private profile" ON public.profiles_private;
CREATE POLICY "Users can delete their own private profile"
ON public.profiles_private
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    user_id = auth.uid()
    OR public.can_admin_access_profile(user_id)
  )
);

-- PROFILES: allow deletion by owner or tenant admin(s) who can access that profile
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    id = auth.uid()
    OR public.can_admin_access_profile(id)
  )
);

-- PAYMENTS: ensure tenant membership is required for user SELECT (defense in depth)
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
CREATE POLICY "Users can view their own payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND public.is_tenant_member(auth.uid(), tenant_id)
);

-- SHIFT_ENTRIES: ensure tenant membership is required for user SELECT
DROP POLICY IF EXISTS "Users can view their own shift entries" ON public.shift_entries;
CREATE POLICY "Users can view their own shift entries"
ON public.shift_entries
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND auth.uid() = plantonista_id
  AND public.is_tenant_member(auth.uid(), tenant_id)
);

-- SHIFT_ASSIGNMENTS: tighten user SELECT to include tenant membership
DROP POLICY IF EXISTS "Users can view their own shift assignments" ON public.shift_assignments;
CREATE POLICY "Users can view their own shift assignments"
ON public.shift_assignments
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND tenant_id IS NOT NULL
  AND public.is_tenant_member(auth.uid(), tenant_id)
);

-- NOTIFICATIONS: tighten user SELECT/UPDATE to include tenant membership
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND public.is_tenant_member(auth.uid(), tenant_id)
);
