-- Tighten RLS for system_settings and user_roles with tenant-scoped visibility.

-- system_settings: super admins only
DROP POLICY IF EXISTS "Authenticated users can view system settings" ON "public"."system_settings";
DROP POLICY IF EXISTS "Super admins can manage system settings" ON "public"."system_settings";
DROP POLICY IF EXISTS "Block anon access on system_settings" ON "public"."system_settings";

CREATE POLICY "Block anon access on system_settings"
ON "public"."system_settings"
AS RESTRICTIVE
FOR ALL
TO "anon"
USING (false)
WITH CHECK (false);

CREATE POLICY "Super admins can manage system settings"
ON "public"."system_settings"
FOR ALL
TO "authenticated"
USING ("public"."is_super_admin"("auth"."uid"()))
WITH CHECK ("public"."is_super_admin"("auth"."uid"()));


-- user_roles: super admin manages; users can see self; tenant admins can view roles for users in their tenant
DROP POLICY IF EXISTS "Admins can manage roles" ON "public"."user_roles";
DROP POLICY IF EXISTS "Admins can view all roles" ON "public"."user_roles";
DROP POLICY IF EXISTS "Users can view their own role" ON "public"."user_roles";
DROP POLICY IF EXISTS "Block anon access on user_roles" ON "public"."user_roles";

CREATE POLICY "Block anon access on user_roles"
ON "public"."user_roles"
AS RESTRICTIVE
FOR ALL
TO "anon"
USING (false)
WITH CHECK (false);

CREATE POLICY "Users can view their own role"
ON "public"."user_roles"
FOR SELECT
TO "authenticated"
USING ("auth"."uid"() = "user_id");

CREATE POLICY "Tenant admins can view roles for users in their tenant"
ON "public"."user_roles"
FOR SELECT
TO "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM "public"."memberships" AS m_admin
    JOIN "public"."memberships" AS m_target
      ON m_admin."tenant_id" = m_target."tenant_id"
    WHERE m_admin."user_id" = "auth"."uid"()
      AND m_admin."role" = 'admin'::"public"."app_role"
      AND m_admin."active" = true
      AND m_target."user_id" = "public"."user_roles"."user_id"
      AND m_target."active" = true
  )
);

CREATE POLICY "Super admins can manage roles"
ON "public"."user_roles"
FOR ALL
TO "authenticated"
USING ("public"."is_super_admin"("auth"."uid"()))
WITH CHECK ("public"."is_super_admin"("auth"."uid"()));
