-- =====================================================
-- FIX: Add RLS to view and ensure policies are correctly applied
-- =====================================================

-- 1. The view shift_assignment_locations_secure needs RLS
-- First, recreate it as a proper secured view that inherits RLS from base table
DROP VIEW IF EXISTS public.shift_assignment_locations_secure;

CREATE VIEW public.shift_assignment_locations_secure
WITH (security_invoker = true)
AS SELECT 
  assignment_id,
  user_id,
  tenant_id,
  checkin_latitude,
  checkin_longitude,
  checkout_latitude,
  checkout_longitude,
  created_at,
  updated_at
FROM public.shift_assignment_locations;

-- Grant select to authenticated only (not anon)
REVOKE ALL ON public.shift_assignment_locations_secure FROM anon;
GRANT SELECT ON public.shift_assignment_locations_secure TO authenticated;

-- 2. Verify RLS is enabled on all tables (belt and suspenders)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_private FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shift_assignment_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignment_locations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shift_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shift_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_offers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences FORCE ROW LEVEL SECURITY;

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins FORCE ROW LEVEL SECURITY;

ALTER TABLE public.login_cpf_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_cpf_rate_limits FORCE ROW LEVEL SECURITY;

ALTER TABLE public.schedule_finalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_finalizations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.schedule_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sector_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sector_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_revenues FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sector_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_expenses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_sector_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sector_values FORCE ROW LEVEL SECURITY;

ALTER TABLE public.conflict_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conflict_resolutions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pii_access_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pii_access_permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payment_access_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_access_permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pii_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pii_audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.gps_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_access_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings FORCE ROW LEVEL SECURITY;