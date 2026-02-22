


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'user'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."swap_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


ALTER TYPE "public"."swap_status" OWNER TO "postgres";


CREATE TYPE "public"."value_status" AS ENUM (
    'COM_VALOR',
    'SEM_VALOR'
);


ALTER TYPE "public"."value_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_member"("member_email" "text", "member_role" "text" DEFAULT 'user'::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_result JSON;
BEGIN
  -- Pega o tenant do usuário atual
  SELECT tenant_id INTO v_tenant_id 
  FROM public.memberships 
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- Busca o ID do usuário pelo email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = member_email;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Usuário não encontrado. Envie um convite primeiro.'
    );
  END IF;
  
  -- Verifica se já é membro
  PERFORM 1 FROM public.memberships 
  WHERE user_id = v_user_id AND tenant_id = v_tenant_id;
  
  IF FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Usuário já é membro deste tenant'
    );
  END IF;
  
  -- Insere na tabela de membros
  INSERT INTO public.memberships (user_id, tenant_id, role, created_at)
  VALUES (v_user_id, v_tenant_id, member_role, NOW())
  RETURNING json_build_object(
    'success', true,
    'message', 'Membro adicionado com sucesso',
    'user_id', v_user_id,
    'tenant_id', v_tenant_id
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."add_member"("member_email" "text", "member_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_member_to_tenant"("member_email" "text", "member_role" "text" DEFAULT 'user'::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_caller_role TEXT;
  v_result JSON;
BEGIN
  -- Pega o tenant do usuário atual
  SELECT DISTINCT tenant_id INTO v_tenant_id
  FROM public.memberships
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- Busca o ID do usuário pelo email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = member_email;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Usuário não encontrado. Crie uma conta primeiro.'
    );
  END IF;
  
  -- Verifica se já é membro
  IF EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE user_id = v_user_id AND tenant_id = v_tenant_id
  ) THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Usuário já é membro deste hospital'
    );
  END IF;
  
  -- Insere na tabela de membros
  INSERT INTO public.memberships (
    user_id, 
    tenant_id, 
    role, 
    active,
    created_at
  ) VALUES (
    v_user_id,
    v_tenant_id,
    member_role,
    true,
    NOW()
  )
  RETURNING json_build_object(
    'success', true,
    'message', 'Membro adicionado com sucesso',
    'user_id', v_user_id,
    'email', member_email,
    'role', member_role
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."add_member_to_tenant"("member_email" "text", "member_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_tenant_member"("member_email" "text", "member_role" "text" DEFAULT 'user'::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_caller_role TEXT;
  v_result JSON;
BEGIN
  -- Pega o tenant e role do usuário que está chamando
  SELECT m.tenant_id, m.role INTO v_tenant_id, v_caller_role
  FROM public.memberships m
  WHERE m.user_id = auth.uid()
  LIMIT 1;
  
  -- Verifica se quem está chamando é admin
  IF v_caller_role != 'admin' THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Apenas administradores podem adicionar membros'
    );
  END IF;
  
  -- Busca o ID do usuário pelo email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = member_email;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Usuário não encontrado. Crie uma conta primeiro.'
    );
  END IF;
  
  -- Verifica se já é membro
  IF EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE user_id = v_user_id AND tenant_id = v_tenant_id
  ) THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Usuário já é membro deste hospital'
    );
  END IF;
  
  -- Insere na tabela de membros
  INSERT INTO public.memberships (
    user_id, 
    tenant_id, 
    role, 
    active,
    created_at, 
    created_by
  ) VALUES (
    v_user_id,
    v_tenant_id,
    member_role,
    true,
    NOW(),
    auth.uid()
  )
  RETURNING json_build_object(
    'success', true,
    'message', 'Membro adicionado com sucesso',
    'user_id', v_user_id,
    'tenant_id', v_tenant_id,
    'role', member_role
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."add_tenant_member"("member_email" "text", "member_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_profiles_private_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.user_id, OLD.user_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pii_audit_logs (table_name, record_id, user_id, tenant_id, action, new_data)
    VALUES (
      'profiles_private',
      NEW.user_id,
      v_actor,
      NEW.tenant_id,
      'INSERT',
      jsonb_build_object('has_cpf', NEW.cpf_enc IS NOT NULL, 'has_bank', NEW.bank_account_enc IS NOT NULL)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.pii_audit_logs (table_name, record_id, user_id, tenant_id, action, old_data, new_data)
    VALUES (
      'profiles_private',
      NEW.user_id,
      v_actor,
      NEW.tenant_id,
      'UPDATE',
      jsonb_build_object('has_cpf', OLD.cpf_enc IS NOT NULL, 'has_bank', OLD.bank_account_enc IS NOT NULL),
      jsonb_build_object('has_cpf', NEW.cpf_enc IS NOT NULL, 'has_bank', NEW.bank_account_enc IS NOT NULL)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.pii_audit_logs (table_name, record_id, user_id, tenant_id, action, old_data)
    VALUES (
      'profiles_private',
      OLD.user_id,
      COALESCE(auth.uid(), OLD.user_id),
      OLD.tenant_id,
      'DELETE',
      jsonb_build_object('has_cpf', OLD.cpf_enc IS NOT NULL, 'has_bank', OLD.bank_account_enc IS NOT NULL)
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."audit_profiles_private_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_trial_end_date"() RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 second')::timestamp with time zone
$$;


ALTER FUNCTION "public"."calculate_trial_end_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_payment"("_payment_tenant_id" "uuid", "_payment_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    auth.uid() IS NOT NULL
    AND _payment_tenant_id IS NOT NULL
    AND (
      -- User can access their own payments if they are a member of that tenant
      (
        auth.uid() = _payment_user_id 
        AND EXISTS (
          SELECT 1 FROM public.memberships 
          WHERE user_id = auth.uid() 
            AND tenant_id = _payment_tenant_id 
            AND active = true
        )
      )
      OR
      -- Finance-authorized users (or super admins) can access payments in tenant
      public.has_payment_access(auth.uid(), _payment_tenant_id)
    );
$$;


ALTER FUNCTION "public"."can_access_payment"("_payment_tenant_id" "uuid", "_payment_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_add_user_to_tenant"("_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT t.current_users_count < p.max_users
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id
$$;


ALTER FUNCTION "public"."can_add_user_to_tenant"("_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_admin_access_profile"("_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships admin_m
    INNER JOIN public.memberships target_m 
      ON target_m.tenant_id = admin_m.tenant_id
    WHERE admin_m.user_id = auth.uid()
      AND admin_m.active = true
      AND admin_m.role = 'admin'
      AND target_m.user_id = _profile_id
  )
  OR is_super_admin(auth.uid())
$$;


ALTER FUNCTION "public"."can_admin_access_profile"("_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_profile"("_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT (
    -- Próprio perfil
    auth.uid() = _profile_id
    -- Ou super admin / GABS bypass
    OR is_super_admin(auth.uid())
    OR has_gabs_bypass(auth.uid())
    -- Ou compartilha ao menos um tenant ativo
    OR EXISTS (
      SELECT 1
      FROM public.memberships my_m
      INNER JOIN public.memberships their_m 
        ON their_m.tenant_id = my_m.tenant_id
      WHERE my_m.user_id = auth.uid()
        AND my_m.active = true
        AND their_m.user_id = _profile_id
        AND their_m.active = true
    )
  )
$$;


ALTER FUNCTION "public"."can_view_profile"("_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_shift"("_shift_id" "uuid", "_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."can_view_shift"("_shift_id" "uuid", "_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_shift_reminders"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.push_notification_queue
  SET status = 'cancelled'
  WHERE user_id = OLD.user_id
    AND shift_id = OLD.shift_id
    AND status = 'pending';
  
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."cancel_shift_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_notifications"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < now() - interval '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_tenant_with_admin"("_name" "text", "_slug" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_plan_id uuid;
  v_trial_end timestamptz;
  v_is_unlimited boolean;
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get default plan
  SELECT id
  INTO v_plan_id
  FROM public.plans
  WHERE active = true
    AND name = 'Gratuito'
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Default plan not found';
  END IF;

  -- Trial until end of month
  v_trial_end :=
    (date_trunc('month', CURRENT_DATE)
      + INTERVAL '1 month'
      - INTERVAL '1 second')::timestamptz;

  -- GABS unlimited
  v_is_unlimited := (lower(_slug) = 'gabs');

  -- Insert tenant
  INSERT INTO public.tenants (
    name,
    slug,
    plan_id,
    created_by,
    billing_status,
    trial_ends_at,
    is_unlimited
  )
  VALUES (
    _name,
    _slug,
    v_plan_id,
    auth.uid(),
    'trial',
    v_trial_end,
    v_is_unlimited
  )
  RETURNING id
  INTO v_tenant_id;

  -- Insert admin membership
  INSERT INTO public.memberships (
    tenant_id,
    user_id,
    role,
    active,
    created_by
  )
  VALUES (
    v_tenant_id,
    auth.uid(),
    'admin',
    true,
    auth.uid()
  );

  RETURN v_tenant_id;
END;
$$;


ALTER FUNCTION "public"."create_tenant_with_admin"("_name" "text", "_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_swap_request"("_swap_request_id" "uuid", "_decision" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_requester_id uuid;
  v_target_user_id uuid;
  v_origin_assignment_id uuid;
  v_current_status public.swap_status;
  v_assignment_user_id uuid;
  v_shift_date date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT tenant_id, requester_id, target_user_id, origin_assignment_id, status
    INTO v_tenant_id, v_requester_id, v_target_user_id, v_origin_assignment_id, v_current_status
  FROM public.swap_requests
  WHERE id = _swap_request_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Swap request not found';
  END IF;

  -- Only the target user or a tenant admin can decide
  IF NOT (auth.uid() = v_target_user_id OR public.is_tenant_admin(auth.uid(), v_tenant_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Must be pending
  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'Swap request is not pending';
  END IF;

  -- Validate the assignment belongs to requester and tenant
  SELECT sa.user_id, s.shift_date
    INTO v_assignment_user_id, v_shift_date
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  WHERE sa.id = v_origin_assignment_id
    AND sa.tenant_id = v_tenant_id
  LIMIT 1;

  IF v_assignment_user_id IS NULL THEN
    RAISE EXCEPTION 'Origin assignment not found';
  END IF;

  IF v_assignment_user_id <> v_requester_id THEN
    RAISE EXCEPTION 'Origin assignment is not owned by requester';
  END IF;

  IF NOT public.is_tenant_member(v_requester_id, v_tenant_id) OR NOT public.is_tenant_member(v_target_user_id, v_tenant_id) THEN
    RAISE EXCEPTION 'Requester/target not in tenant';
  END IF;

  -- Persist decision
  UPDATE public.swap_requests
  SET status = _decision::public.swap_status,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = _swap_request_id;

  -- If approved, transfer assignment to target user
  IF _decision = 'approved' THEN
    -- Prevent swapping past shifts
    IF v_shift_date < current_date THEN
      RAISE EXCEPTION 'Cannot swap past shifts';
    END IF;

    -- Enable bypass only for this transaction scope
    PERFORM set_config('app.bypass_restrict_user_assignment_update', 'true', true);

    UPDATE public.shift_assignments
    SET user_id = v_target_user_id,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = v_origin_assignment_id;

    -- Disable bypass explicitly (defense-in-depth)
    PERFORM set_config('app.bypass_restrict_user_assignment_update', 'false', true);
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."decide_swap_request"("_swap_request_id" "uuid", "_decision" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_profiles_private_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- If tenant_id not provided, derive from an active membership
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id
    INTO v_tenant_id
    FROM public.memberships
    WHERE user_id = NEW.user_id
      AND active = true
    ORDER BY tenant_id
    LIMIT 1;

    NEW.tenant_id := v_tenant_id;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'profiles_private.tenant_id is required (user has no active membership)';
  END IF;

  -- Ensure the user_id actually belongs to that tenant (prevents wrong-tenant writes)
  IF NOT public.is_tenant_member(NEW.user_id, NEW.tenant_id) THEN
    RAISE EXCEPTION 'profiles_private tenant mismatch';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_profiles_private_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_tenants_admin"() RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "billing_status" "text", "is_unlimited" boolean, "trial_ends_at" timestamp with time zone, "current_users_count" integer, "plan_name" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.billing_status,
    t.is_unlimited,
    t.trial_ends_at,
    t.current_users_count,
    p.name AS plan_name,
    t.created_at
  FROM public.tenants t
  LEFT JOIN public.plans p ON p.id = t.plan_id
  WHERE is_super_admin()
  ORDER BY t.created_at DESC;
$$;


ALTER FUNCTION "public"."get_all_tenants_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_assignment_location_with_audit"("_assignment_id" "uuid", "_tenant_id" "uuid") RETURNS TABLE("assignment_id" "uuid", "user_id" "uuid", "tenant_id" "uuid", "checkin_latitude" numeric, "checkin_longitude" numeric, "checkout_latitude" numeric, "checkout_longitude" numeric, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_target_user_id uuid;
BEGIN
  -- Verify caller is tenant admin
  IF NOT is_tenant_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get target user id for audit
  SELECT sal.user_id INTO v_target_user_id
  FROM public.shift_assignment_locations sal
  WHERE sal.assignment_id = _assignment_id AND sal.tenant_id = _tenant_id
  LIMIT 1;

  -- Log the access if location exists and admin is not the owner
  IF v_target_user_id IS NOT NULL AND v_target_user_id != auth.uid() THEN
    INSERT INTO public.gps_access_logs (admin_user_id, target_user_id, assignment_id, tenant_id)
    VALUES (auth.uid(), v_target_user_id, _assignment_id, _tenant_id);
  END IF;

  -- Return the location data
  RETURN QUERY
  SELECT 
    sal.assignment_id,
    sal.user_id,
    sal.tenant_id,
    sal.checkin_latitude,
    sal.checkin_longitude,
    sal.checkout_latitude,
    sal.checkout_longitude,
    sal.created_at,
    sal.updated_at
  FROM public.shift_assignment_locations sal
  WHERE sal.assignment_id = _assignment_id AND sal.tenant_id = _tenant_id;
END;
$$;


ALTER FUNCTION "public"."get_assignment_location_with_audit"("_assignment_id" "uuid", "_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_gabs_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 'b2541db1-5029-4fb9-8d1c-870c2738e0d6'::uuid
$$;


ALTER FUNCTION "public"."get_gabs_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profile_private_with_audit"("_user_id" "uuid", "_tenant_id" "uuid") RETURNS TABLE("user_id" "uuid", "tenant_id" "uuid", "cpf_enc" "bytea", "crm_enc" "bytea", "phone_enc" "bytea", "address_enc" "bytea", "bank_name_enc" "bytea", "bank_agency_enc" "bytea", "bank_account_enc" "bytea", "pix_key_enc" "bytea", "rqe_enc" "bytea")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Verify caller has access
  IF NOT (auth.uid() = _user_id OR public.has_pii_access(auth.uid(), _tenant_id)) THEN
    RAISE EXCEPTION 'Not authorized to access this profile';
  END IF;

  -- Log access if not own profile
  IF auth.uid() != _user_id THEN
    INSERT INTO public.pii_audit_logs (
      table_name, record_id, user_id, tenant_id, action, new_data
    ) VALUES (
      'profiles_private',
      _user_id::text,
      auth.uid(),
      _tenant_id,
      'VIEW',
      jsonb_build_object('accessed_by', auth.uid(), 'accessed_at', now())
    );
  END IF;

  -- Return the data
  RETURN QUERY
  SELECT 
    pp.user_id,
    pp.tenant_id,
    pp.cpf_enc,
    pp.crm_enc,
    pp.phone_enc,
    pp.address_enc,
    pp.bank_name_enc,
    pp.bank_agency_enc,
    pp.bank_account_enc,
    pp.pix_key_enc,
    pp.rqe_enc
  FROM public.profiles_private pp
  WHERE pp.user_id = _user_id
    AND pp.tenant_id = _tenant_id;
END;
$$;


ALTER FUNCTION "public"."get_profile_private_with_audit"("_user_id" "uuid", "_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shift_assignments_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") RETURNS TABLE("id" "uuid", "shift_id" "uuid", "user_id" "uuid", "assigned_value" numeric, "status" "text", "name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    sa.id,
    sa.shift_id,
    sa.user_id,
    sa.assigned_value,
    sa.status,
    p.name
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  JOIN public.profiles p ON p.id = sa.user_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND s.shift_date <= _end
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;


ALTER FUNCTION "public"."get_shift_assignments_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shift_assignments_without_gps"("_tenant_id" "uuid") RETURNS TABLE("id" "uuid", "shift_id" "uuid", "user_id" "uuid", "tenant_id" "uuid", "status" "text", "assigned_value" numeric, "notes" "text", "checkin_at" timestamp with time zone, "checkout_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    sa.id,
    sa.shift_id,
    sa.user_id,
    sa.tenant_id,
    sa.status,
    sa.assigned_value,
    sa.notes,
    sa.checkin_at,
    sa.checkout_at,
    sa.created_at,
    sa.updated_at
  FROM public.shift_assignments sa
  WHERE sa.tenant_id = _tenant_id
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;


ALTER FUNCTION "public"."get_shift_assignments_without_gps"("_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shift_offers_pending_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") RETURNS TABLE("id" "uuid", "shift_id" "uuid", "user_id" "uuid", "status" "text", "message" "text", "name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    so.id,
    so.shift_id,
    so.user_id,
    so.status,
    so.message,
    p.name
  FROM public.shift_offers so
  JOIN public.shifts s ON s.id = so.shift_id
  JOIN public.profiles p ON p.id = so.user_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND s.shift_date <= _end
    AND so.status = 'pending'
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;


ALTER FUNCTION "public"."get_shift_offers_pending_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shift_roster"("_tenant_id" "uuid", "_start" "date", "_end" "date") RETURNS TABLE("shift_id" "uuid", "user_id" "uuid", "status" "text", "name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    sa.shift_id,
    sa.user_id,
    sa.status,
    p.name
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  JOIN public.profiles p ON p.id = sa.user_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND s.shift_date <= _end
    AND public.is_tenant_member(auth.uid(), _tenant_id);
$$;


ALTER FUNCTION "public"."get_shift_roster"("_tenant_id" "uuid", "_start" "date", "_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shift_tenant_id"("_shift_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT tenant_id
  FROM public.shifts
  WHERE id = _shift_id
  LIMIT 1
$$;


ALTER FUNCTION "public"."get_shift_tenant_id"("_shift_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_taken_shift_ids"("_tenant_id" "uuid", "_start" "date") RETURNS TABLE("shift_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT sa.shift_id
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  WHERE s.tenant_id = _tenant_id
    AND s.shift_date >= _start
    AND public.is_tenant_member(auth.uid(), _tenant_id)
    AND sa.status IN ('assigned', 'confirmed', 'completed');
$$;


ALTER FUNCTION "public"."get_taken_shift_ids"("_tenant_id" "uuid", "_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_access_status"("_tenant_id" "uuid") RETURNS TABLE("status" "text", "is_unlimited" boolean, "trial_ends_at" timestamp with time zone, "days_remaining" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    t.billing_status,
    t.is_unlimited,
    t.trial_ends_at,
    CASE 
      WHEN t.is_unlimited THEN NULL
      WHEN t.trial_ends_at IS NULL THEN 0
      ELSE GREATEST(0, EXTRACT(DAY FROM (t.trial_ends_at - NOW()))::integer)
    END
  FROM public.tenants t
  WHERE t.id = _tenant_id
$$;


ALTER FUNCTION "public"."get_tenant_access_status"("_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_member_names"("_tenant_id" "uuid") RETURNS TABLE("user_id" "uuid", "name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Verificar se o usuário tem permissão primeiro
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RETURN;
  END IF;

  -- Retornar os membros do tenant
  RETURN QUERY
  SELECT p.id AS user_id, p.name
  FROM public.memberships m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.tenant_id = _tenant_id
    AND m.active = true
  ORDER BY p.name NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_tenant_member_names"("_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_subscription"("_tenant_id" "uuid") RETURNS TABLE("plan_name" "text", "max_users" integer, "current_users" integer, "price_monthly" numeric, "billing_status" "text", "trial_ends_at" timestamp with time zone, "features" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    p.name,
    p.max_users,
    t.current_users_count,
    p.price_monthly,
    t.billing_status,
    t.trial_ends_at,
    p.features
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id
$$;


ALTER FUNCTION "public"."get_tenant_subscription"("_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("_user_id" "uuid") RETURNS "public"."app_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;


ALTER FUNCTION "public"."get_user_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_tenants"("_user_id" "uuid") RETURNS TABLE("tenant_id" "uuid", "tenant_name" "text", "role" "public"."app_role")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT m.tenant_id, t.name, m.role
  FROM public.memberships m
  JOIN public.tenants t ON t.id = m.tenant_id
  WHERE m.user_id = _user_id AND m.active = true
$$;


ALTER FUNCTION "public"."get_user_tenants"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email));
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_gabs_bypass"("_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins sa
    JOIN public.memberships m ON m.user_id = sa.user_id
    WHERE sa.user_id = _user_id
      AND m.tenant_id = public.get_gabs_tenant_id()
      AND m.active = true
  )
$$;


ALTER FUNCTION "public"."has_gabs_bypass"("_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_gabs_bypass"("_user_id" "uuid") IS 'SECURITY: Intentional bypass for GABS internal staff who are super_admins. 
Required for: system administration, support, compliance auditing.
Requires BOTH conditions: is super_admin AND has active membership in GABS tenant.
Documented in docs/SECURITY_DECISIONS.md section 11.';



CREATE OR REPLACE FUNCTION "public"."has_gps_access"("_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    )
    -- Must be tenant member
    AND is_tenant_member(auth.uid(), _tenant_id)
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.gps_access_grants gag
      WHERE gag.user_id = auth.uid()
        AND gag.tenant_id = _tenant_id
        AND gag.expires_at IS NOT NULL
        AND gag.expires_at > now()
    )
  )
$$;


ALTER FUNCTION "public"."has_gps_access"("_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_gps_access"("_tenant_id" "uuid") IS 'GPS access requires: authenticated + tenant_member + explicit grant in gps_access_grants with expires_at > now(). No automatic bypass.';



CREATE OR REPLACE FUNCTION "public"."has_gps_access"("_user_id" "uuid", "_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(_user_id, _tenant_id)
      OR public.is_super_admin(_user_id)
    )
    -- Must be tenant member
    AND is_tenant_member(_user_id, _tenant_id)
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.gps_access_grants gag
      WHERE gag.user_id = _user_id
        AND gag.tenant_id = _tenant_id
        AND gag.expires_at IS NOT NULL
        AND gag.expires_at > now()
    )
  )
$$;


ALTER FUNCTION "public"."has_gps_access"("_user_id" "uuid", "_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_gps_access"("_user_id" "uuid", "_tenant_id" "uuid") IS 'GPS access requires: tenant_member + explicit grant in gps_access_grants with expires_at > now(). No automatic bypass.';



CREATE OR REPLACE FUNCTION "public"."has_payment_access"("_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    )
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = auth.uid()
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;


ALTER FUNCTION "public"."has_payment_access"("_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_payment_access"("_tenant_id" "uuid") IS 'Check if current user has payment access for tenant (single-arg version)';



CREATE OR REPLACE FUNCTION "public"."has_payment_access"("_user_id" "uuid", "_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(_user_id, _tenant_id)
      OR public.is_super_admin(_user_id)
    )
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.payment_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;


ALTER FUNCTION "public"."has_payment_access"("_user_id" "uuid", "_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_payment_access"("_user_id" "uuid", "_tenant_id" "uuid") IS 'Check if specific user has payment access for tenant (two-arg version for RPC)';



CREATE OR REPLACE FUNCTION "public"."has_pii_access"("_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT (
    auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.is_super_admin(auth.uid())
    )
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.pii_access_permissions pap
      WHERE pap.user_id = auth.uid()
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;


ALTER FUNCTION "public"."has_pii_access"("_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_pii_access"("_tenant_id" "uuid") IS 'Check if current user has PII access for tenant (single-arg version)';



CREATE OR REPLACE FUNCTION "public"."has_pii_access"("_user_id" "uuid", "_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT (
    _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    -- Must be admin in this tenant OR super_admin
    AND (
      public.is_tenant_admin(_user_id, _tenant_id)
      OR public.is_super_admin(_user_id)
    )
    -- AND have explicit temporal grant
    AND EXISTS (
      SELECT 1
      FROM public.pii_access_permissions pap
      WHERE pap.user_id = _user_id
        AND pap.tenant_id = _tenant_id
        AND pap.expires_at IS NOT NULL
        AND pap.expires_at > now()
    )
  )
$$;


ALTER FUNCTION "public"."has_pii_access"("_user_id" "uuid", "_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_pii_access"("_user_id" "uuid", "_tenant_id" "uuid") IS 'Check if specific user has PII access for tenant (two-arg version for RPC)';



CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_assigned_to_shift"("_shift_id" "uuid", "_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.shift_id = _shift_id
      AND sa.user_id = _user_id
  )
$$;


ALTER FUNCTION "public"."is_assigned_to_shift"("_shift_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_sector_member_of_shift"("_shift_id" "uuid", "_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shifts s
    INNER JOIN public.sector_memberships sm 
      ON sm.sector_id = s.sector_id 
      AND sm.tenant_id = s.tenant_id
    WHERE s.id = _shift_id
      AND sm.user_id = _user_id
  )
$$;


ALTER FUNCTION "public"."is_sector_member_of_shift"("_shift_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"("_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins
    WHERE user_id = _user_id
  );
$$;


ALTER FUNCTION "public"."is_super_admin"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tenant_access_active"("_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    CASE 
      WHEN is_unlimited THEN true
      WHEN billing_status = 'active' THEN true
      WHEN billing_status = 'trial' AND trial_ends_at > NOW() THEN true
      ELSE false
    END
  FROM public.tenants
  WHERE id = _tenant_id
$$;


ALTER FUNCTION "public"."is_tenant_access_active"("_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tenant_admin"("_user_id" "uuid", "_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role = 'admin'
      AND active = true
  )
$$;


ALTER FUNCTION "public"."is_tenant_admin"("_user_id" "uuid", "_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tenant_member"("_user_id" "uuid", "_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND active = true
  )
$$;


ALTER FUNCTION "public"."is_tenant_member"("_user_id" "uuid", "_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_gps_grant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.pii_audit_logs (
    table_name, record_id, user_id, tenant_id, action, new_data
  ) VALUES (
    'gps_access_grants',
    NEW.id::text,
    auth.uid(),
    NEW.tenant_id,
    'GPS_GRANT_CREATED',
    jsonb_build_object(
      'granted_to', NEW.user_id,
      'expires_at', NEW.expires_at,
      'reason', NEW.reason
    )
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_gps_grant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_pii_grant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.pii_audit_logs (
    table_name, record_id, user_id, tenant_id, action, new_data
  ) VALUES (
    'pii_access_permissions',
    NEW.id::text,
    auth.uid(),
    NEW.tenant_id,
    'GRANT_CREATED',
    jsonb_build_object(
      'granted_to', NEW.user_id,
      'expires_at', NEW.expires_at,
      'reason', NEW.reason
    )
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_pii_grant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_profiles_private_tenant_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'profiles_private.tenant_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_profiles_private_tenant_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_sensitive_fk_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Block tenant_id changes (defense-in-depth against accidental or malicious edits)
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id cannot be changed';
  END IF;

  -- Block user_id changes on payments (prevents reassigning payment rows to another user)
  IF TG_TABLE_NAME = 'payments' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_sensitive_fk_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_security_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- If must_change_password is being changed
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    -- Only allow if:
    -- 1. The user is updating their own profile (auth.uid() = profile id)
    -- 2. OR it's a service role call (auth.uid() is null in service role context)
    IF auth.uid() IS NOT NULL AND auth.uid() != OLD.id THEN
      -- Admin trying to change must_change_password - block it
      NEW.must_change_password := OLD.must_change_password;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_profile_security_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restrict_user_assignment_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_bypass boolean := false;
BEGIN
  -- Bypass only when explicitly enabled in-session by a SECURITY DEFINER function.
  v_bypass := (current_setting('app.bypass_restrict_user_assignment_update', true) = 'true');

  -- If user is NOT admin and bypass not enabled, only allow checkin_at/checkout_at changes
  IF NOT v_bypass
     AND NOT public.is_tenant_admin(auth.uid(), OLD.tenant_id)
     AND NOT public.has_gabs_bypass(auth.uid()) THEN

    -- Force other fields to remain unchanged
    NEW.shift_id := OLD.shift_id;
    NEW.user_id := OLD.user_id;
    NEW.tenant_id := OLD.tenant_id;
    NEW.assigned_value := OLD.assigned_value;
    NEW.status := OLD.status;
    NEW.notes := OLD.notes;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    -- Only allow updating: checkin_at, checkout_at, updated_at, updated_by
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restrict_user_assignment_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_shift_reminders"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_shift_date DATE;
  v_start_time TIME;
  v_shift_datetime TIMESTAMPTZ;
  v_shift_title TEXT;
  v_tenant_id UUID;
  v_prefs RECORD;
BEGIN
  -- Get shift details
  SELECT s.shift_date, s.start_time, s.title, s.tenant_id
  INTO v_shift_date, v_start_time, v_shift_title, v_tenant_id
  FROM public.shifts s
  WHERE s.id = NEW.shift_id;

  -- Calculate shift datetime
  v_shift_datetime := (v_shift_date || ' ' || v_start_time)::TIMESTAMPTZ;

  -- Get user preferences
  SELECT * INTO v_prefs
  FROM public.user_notification_preferences
  WHERE user_id = NEW.user_id;

  -- If no preferences, use defaults
  IF v_prefs IS NULL THEN
    v_prefs.push_enabled := true;
    v_prefs.reminder_24h_enabled := true;
    v_prefs.reminder_2h_enabled := true;
    v_prefs.shift_start_enabled := true;
  END IF;

  -- Only schedule if push is enabled
  IF v_prefs.push_enabled THEN
    -- Cancel any existing reminders for this assignment
    UPDATE public.push_notification_queue
    SET status = 'cancelled'
    WHERE user_id = NEW.user_id
      AND shift_id = NEW.shift_id
      AND status = 'pending';

    -- Schedule 24h reminder
    IF v_prefs.reminder_24h_enabled AND v_shift_datetime - INTERVAL '24 hours' > NOW() THEN
      INSERT INTO public.push_notification_queue (user_id, tenant_id, shift_id, notification_type, title, message, scheduled_for, data)
      VALUES (
        NEW.user_id,
        v_tenant_id,
        NEW.shift_id,
        'reminder_24h',
        '📅 Plantão amanhã',
        'Seu plantão "' || v_shift_title || '" começa em 24 horas.',
        v_shift_datetime - INTERVAL '24 hours',
        jsonb_build_object('shift_id', NEW.shift_id, 'assignment_id', NEW.id)
      );
    END IF;

    -- Schedule 2h reminder
    IF v_prefs.reminder_2h_enabled AND v_shift_datetime - INTERVAL '2 hours' > NOW() THEN
      INSERT INTO public.push_notification_queue (user_id, tenant_id, shift_id, notification_type, title, message, scheduled_for, data)
      VALUES (
        NEW.user_id,
        v_tenant_id,
        NEW.shift_id,
        'reminder_2h',
        '⏰ Plantão em 2 horas',
        'Seu plantão "' || v_shift_title || '" começa em 2 horas!',
        v_shift_datetime - INTERVAL '2 hours',
        jsonb_build_object('shift_id', NEW.shift_id, 'assignment_id', NEW.id)
      );
    END IF;

    -- Schedule shift start notification
    IF v_prefs.shift_start_enabled AND v_shift_datetime > NOW() THEN
      INSERT INTO public.push_notification_queue (user_id, tenant_id, shift_id, notification_type, title, message, scheduled_for, data)
      VALUES (
        NEW.user_id,
        v_tenant_id,
        NEW.shift_id,
        'shift_start',
        '🏥 Plantão iniciando',
        'Seu plantão "' || v_shift_title || '" está começando agora. Não esqueça do check-in!',
        v_shift_datetime,
        jsonb_build_object('shift_id', NEW.shift_id, 'assignment_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."schedule_shift_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tenant_access"("_tenant_id" "uuid", "_billing_status" "text" DEFAULT NULL::"text", "_is_unlimited" boolean DEFAULT NULL::boolean, "_trial_ends_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can update tenant access';
  END IF;

  UPDATE public.tenants
  SET
    billing_status = COALESCE(_billing_status, billing_status),
    is_unlimited   = COALESCE(_is_unlimited, is_unlimited),
    trial_ends_at  = COALESCE(_trial_ends_at, trial_ends_at),
    updated_at     = now()
  WHERE id = _tenant_id;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_tenant_access"("_tenant_id" "uuid", "_billing_status" "text", "_is_unlimited" boolean, "_trial_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tenant_user_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.tenants 
    SET current_users_count = (
      SELECT COUNT(*) FROM public.memberships 
      WHERE tenant_id = NEW.tenant_id AND active = true
    )
    WHERE id = NEW.tenant_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.tenants 
    SET current_users_count = (
      SELECT COUNT(*) FROM public.memberships 
      WHERE tenant_id = OLD.tenant_id AND active = true
    )
    WHERE id = OLD.tenant_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_tenant_user_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_active_membership"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = _user_id
      AND active = true
  )
$$;


ALTER FUNCTION "public"."user_has_active_membership"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_shift_assignment_location_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.assignment_id IS NULL OR NEW.user_id IS NULL OR NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'assignment_id, user_id, tenant_id are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.id = NEW.assignment_id
      AND sa.user_id = NEW.user_id
      AND sa.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Invalid assignment_id for given user/tenant';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_shift_assignment_location_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_schedule_reopen_password"("_password" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings
    WHERE setting_key = 'schedule_reopen_password'
      AND setting_value = _password
  )
$$;


ALTER FUNCTION "public"."verify_schedule_reopen_password"("_password" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "reason" "text",
    "document_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "absences_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "absences_type_check" CHECK (("type" = ANY (ARRAY['falta'::"text", 'atestado'::"text", 'licenca'::"text", 'ferias'::"text", 'outro'::"text"])))
);

ALTER TABLE ONLY "public"."absences" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."absences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_sync_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "assignment_id" "uuid",
    "native_event_id" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "last_synced_at" timestamp with time zone DEFAULT "now"(),
    "shift_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "calendar_sync_events_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."calendar_sync_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conflict_resolutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "conflict_date" "date" NOT NULL,
    "plantonista_id" "uuid" NOT NULL,
    "plantonista_name" "text" NOT NULL,
    "resolution_type" "text" NOT NULL,
    "justification" "text",
    "removed_sector_name" "text",
    "removed_shift_time" "text",
    "removed_assignment_id" "uuid",
    "kept_sector_name" "text",
    "kept_shift_time" "text",
    "kept_assignment_id" "uuid",
    "conflict_details" "jsonb",
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conflict_resolutions_resolution_type_check" CHECK (("resolution_type" = ANY (ARRAY['acknowledged'::"text", 'removed'::"text"])))
);

ALTER TABLE ONLY "public"."conflict_resolutions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."conflict_resolutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gps_access_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "reason" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gps_access_grants" OWNER TO "postgres";


COMMENT ON TABLE "public"."gps_access_grants" IS 'Grants temporais para acesso a dados GPS. Requer expires_at e reason. Super admins precisam de grant explícito.';



CREATE TABLE IF NOT EXISTS "public"."gps_access_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text",
    "user_agent" "text"
);

ALTER TABLE ONLY "public"."gps_access_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."gps_access_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_cpf_rate_limits" (
    "key" "text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "first_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."login_cpf_rate_limits" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_cpf_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'user'::"public"."app_role" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid"
);

ALTER TABLE ONLY "public"."memberships" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "shift_assignment_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."notifications" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_access_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "expires_at" timestamp with time zone,
    "reason" "text"
);

ALTER TABLE ONLY "public"."payment_access_permissions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_access_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month" integer NOT NULL,
    "year" integer NOT NULL,
    "total_shifts" integer DEFAULT 0 NOT NULL,
    "total_hours" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_value" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "closed_at" timestamp with time zone,
    "closed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    CONSTRAINT "payments_month_check" CHECK ((("month" >= 1) AND ("month" <= 12))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'paid'::"text"]))),
    CONSTRAINT "payments_year_check" CHECK (("year" >= 2020))
);

ALTER TABLE ONLY "public"."payments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."payments" IS 'Pagamentos. Visibilidade: próprio usuário ou finance com grant temporal.';



CREATE TABLE IF NOT EXISTS "public"."pii_access_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "expires_at" timestamp with time zone,
    "reason" "text"
);

ALTER TABLE ONLY "public"."pii_access_permissions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."pii_access_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pii_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid",
    "action" "text" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."pii_audit_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."pii_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "min_users" integer DEFAULT 1 NOT NULL,
    "max_users" integer NOT NULL,
    "price_monthly" numeric DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."plans" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_type" "text" DEFAULT 'plantonista'::"text",
    "must_change_password" boolean DEFAULT false NOT NULL,
    "email" "text"
);

ALTER TABLE ONLY "public"."profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."profile_type" IS 'Profile type: plantonista, administrador, outros';



COMMENT ON COLUMN "public"."profiles"."must_change_password" IS 'When true, user must change password on next login';



CREATE TABLE IF NOT EXISTS "public"."profiles_private" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cpf_enc" "bytea",
    "crm_enc" "bytea",
    "phone_enc" "bytea",
    "address_enc" "bytea",
    "bank_name_enc" "bytea",
    "bank_agency_enc" "bytea",
    "bank_account_enc" "bytea",
    "pix_key_enc" "bytea",
    "tenant_id" "uuid" NOT NULL,
    "rqe_enc" "bytea"
);

ALTER TABLE ONLY "public"."profiles_private" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles_private" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles_private" IS 'Dados PII criptografados. tenant_id obrigatório para RLS. Acesso via edge function pii-crypto.';



COMMENT ON COLUMN "public"."profiles_private"."cpf_enc" IS 'Encrypted CPF (pgp_sym_encrypt). Plaintext cpf column will be deprecated.';



COMMENT ON COLUMN "public"."profiles_private"."crm_enc" IS 'Encrypted CRM (pgp_sym_encrypt). Plaintext crm column will be deprecated.';



COMMENT ON COLUMN "public"."profiles_private"."phone_enc" IS 'Encrypted phone (pgp_sym_encrypt). Plaintext phone column will be deprecated.';



COMMENT ON COLUMN "public"."profiles_private"."address_enc" IS 'Encrypted address (pgp_sym_encrypt). Plaintext address column will be deprecated.';



COMMENT ON COLUMN "public"."profiles_private"."bank_name_enc" IS 'Encrypted bank name (pgp_sym_encrypt). Plaintext bank_name will be deprecated.';



COMMENT ON COLUMN "public"."profiles_private"."bank_agency_enc" IS 'Encrypted bank agency (pgp_sym_encrypt). Plaintext bank_agency will be deprecated.';



COMMENT ON COLUMN "public"."profiles_private"."bank_account_enc" IS 'Encrypted bank account (pgp_sym_encrypt). Plaintext bank_account will be deprecated.';



COMMENT ON COLUMN "public"."profiles_private"."pix_key_enc" IS 'Encrypted PIX key (pgp_sym_encrypt). Plaintext pix_key will be deprecated.';



CREATE TABLE IF NOT EXISTS "public"."push_device_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "device_token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "onesignal_player_id" "text",
    "app_version" "text",
    "device_model" "text",
    "os_version" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "push_device_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."push_device_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_notification_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "shift_id" "uuid",
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "data" "jsonb",
    "scheduled_for" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "push_notification_queue_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['reminder_24h'::"text", 'reminder_2h'::"text", 'shift_start'::"text", 'swap_request'::"text", 'swap_accepted'::"text", 'swap_rejected'::"text"]))),
    CONSTRAINT "push_notification_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."push_notification_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_finalizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "month" integer NOT NULL,
    "year" integer NOT NULL,
    "finalized_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finalized_by" "uuid" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sector_id" "uuid",
    CONSTRAINT "schedule_finalizations_month_check" CHECK ((("month" >= 1) AND ("month" <= 12))),
    CONSTRAINT "schedule_finalizations_year_check" CHECK (("year" >= 2020))
);

ALTER TABLE ONLY "public"."schedule_finalizations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_finalizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "month" integer NOT NULL,
    "year" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text" NOT NULL,
    "movement_type" "text" NOT NULL,
    "source_sector_id" "uuid",
    "source_sector_name" "text",
    "source_shift_date" "date",
    "source_shift_time" "text",
    "source_assignment_id" "uuid",
    "destination_sector_id" "uuid",
    "destination_sector_name" "text",
    "destination_shift_date" "date",
    "destination_shift_time" "text",
    "destination_assignment_id" "uuid",
    "reason" "text",
    "performed_by" "uuid" NOT NULL,
    "performed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "schedule_movements_month_check" CHECK ((("month" >= 1) AND ("month" <= 12))),
    CONSTRAINT "schedule_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['transferred'::"text", 'removed'::"text", 'added'::"text"]))),
    CONSTRAINT "schedule_movements_year_check" CHECK (("year" >= 2020))
);

ALTER TABLE ONLY "public"."schedule_movements" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sector_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "sector_id" "uuid" NOT NULL,
    "month" integer NOT NULL,
    "year" integer NOT NULL,
    "expense_type" "text" NOT NULL,
    "expense_name" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "sector_expenses_expense_type_check" CHECK (("expense_type" = ANY (ARRAY['tax'::"text", 'general'::"text", 'specific'::"text"]))),
    CONSTRAINT "sector_expenses_month_check" CHECK ((("month" >= 1) AND ("month" <= 12))),
    CONSTRAINT "sector_expenses_year_check" CHECK (("year" >= 2020))
);

ALTER TABLE ONLY "public"."sector_expenses" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."sector_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sector_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sector_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);

ALTER TABLE ONLY "public"."sector_memberships" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."sector_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sector_revenues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "sector_id" "uuid" NOT NULL,
    "month" integer NOT NULL,
    "year" integer NOT NULL,
    "fixed_revenue" numeric DEFAULT 0 NOT NULL,
    "variable_revenue" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "sector_revenues_month_check" CHECK ((("month" >= 1) AND ("month" <= 12))),
    CONSTRAINT "sector_revenues_year_check" CHECK (("year" >= 2020))
);

ALTER TABLE ONLY "public"."sector_revenues" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."sector_revenues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sectors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#22c55e'::"text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "require_gps_checkin" boolean DEFAULT false NOT NULL,
    "allowed_checkin_radius_meters" integer DEFAULT 500,
    "checkin_enabled" boolean DEFAULT false NOT NULL,
    "checkin_tolerance_minutes" integer DEFAULT 30 NOT NULL,
    "default_day_value" numeric,
    "default_night_value" numeric,
    "reference_latitude" numeric,
    "reference_longitude" numeric
);

ALTER TABLE ONLY "public"."sectors" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."sectors" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sectors"."default_day_value" IS 'Valor padrão para plantões diurnos (7h-19h) deste setor';



COMMENT ON COLUMN "public"."sectors"."default_night_value" IS 'Valor padrão para plantões noturnos (19h-7h) deste setor';



COMMENT ON COLUMN "public"."sectors"."reference_latitude" IS 'Latitude de referência do local de trabalho do setor';



COMMENT ON COLUMN "public"."sectors"."reference_longitude" IS 'Longitude de referência do local de trabalho do setor';



CREATE TABLE IF NOT EXISTS "public"."shift_assignment_locations" (
    "assignment_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "checkin_latitude" numeric,
    "checkin_longitude" numeric,
    "checkout_latitude" numeric,
    "checkout_longitude" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."shift_assignment_locations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_assignment_locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."shift_assignment_locations" IS 'GPS location data - RLS forced, anon revoked, RESTRICTIVE block policy';



CREATE TABLE IF NOT EXISTS "public"."shift_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assigned_value" numeric(10,2),
    "checkin_at" timestamp with time zone,
    "checkout_at" timestamp with time zone,
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "tenant_id" "uuid" NOT NULL,
    CONSTRAINT "shift_assignments_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."shift_assignments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."shift_assignments" IS 'Atribuições de plantão. RLS: Membros do setor podem ver todas atribuições do setor. Admins gerenciam tudo.';



CREATE TABLE IF NOT EXISTS "public"."shift_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "setor_id" "uuid" NOT NULL,
    "escala_id" "uuid",
    "data" "date" NOT NULL,
    "plantonista_id" "uuid" NOT NULL,
    "valor" numeric,
    "status_valor" "public"."value_status" DEFAULT 'SEM_VALOR'::"public"."value_status" NOT NULL,
    "source_shift_id" "uuid",
    "source_assignment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."shift_entries" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid",
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "shift_offers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);

ALTER TABLE ONLY "public"."shift_offers" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "hospital" "text" NOT NULL,
    "location" "text",
    "shift_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "base_value" numeric(10,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "sector_id" "uuid",
    CONSTRAINT "shifts_tenant_id_not_empty" CHECK (("tenant_id" IS NOT NULL))
);

ALTER TABLE ONLY "public"."shifts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."shifts" OWNER TO "postgres";


COMMENT ON TABLE "public"."shifts" IS 'Plantões. Visibilidade: admin do tenant, membro do setor, ou escalado no plantão.';



CREATE TABLE IF NOT EXISTS "public"."super_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);

ALTER TABLE ONLY "public"."super_admins" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."super_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."swap_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "origin_assignment_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "target_user_id" "uuid",
    "status" "public"."swap_status" DEFAULT 'pending'::"public"."swap_status" NOT NULL,
    "reason" "text",
    "admin_notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid"
);

ALTER TABLE ONLY "public"."swap_requests" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."swap_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);

ALTER TABLE ONLY "public"."system_settings" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "billing_status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "current_users_count" integer DEFAULT 0 NOT NULL,
    "is_unlimited" boolean DEFAULT false NOT NULL,
    "created_by" "uuid"
);

ALTER TABLE ONLY "public"."tenants" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tenants"."is_unlimited" IS 'When true, tenant has no trial expiration (e.g., GABS)';



CREATE TABLE IF NOT EXISTS "public"."user_notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid",
    "push_enabled" boolean DEFAULT true,
    "reminder_24h_enabled" boolean DEFAULT true,
    "reminder_2h_enabled" boolean DEFAULT true,
    "shift_start_enabled" boolean DEFAULT true,
    "swap_notifications_enabled" boolean DEFAULT true,
    "calendar_sync_enabled" boolean DEFAULT false,
    "calendar_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'user'::"public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."user_roles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_sector_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "sector_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "day_value" numeric,
    "night_value" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "month" integer,
    "year" integer
);

ALTER TABLE ONLY "public"."user_sector_values" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_sector_values" OWNER TO "postgres";


ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_sync_events"
    ADD CONSTRAINT "calendar_sync_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_sync_events"
    ADD CONSTRAINT "calendar_sync_events_user_id_shift_id_platform_key" UNIQUE ("user_id", "shift_id", "platform");



ALTER TABLE ONLY "public"."conflict_resolutions"
    ADD CONSTRAINT "conflict_resolutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gps_access_grants"
    ADD CONSTRAINT "gps_access_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gps_access_grants"
    ADD CONSTRAINT "gps_access_grants_unique" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."gps_access_logs"
    ADD CONSTRAINT "gps_access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_cpf_rate_limits"
    ADD CONSTRAINT "login_cpf_rate_limits_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_tenant_id_user_id_key" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_access_permissions"
    ADD CONSTRAINT "payment_access_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_access_permissions"
    ADD CONSTRAINT "payment_access_permissions_tenant_id_user_id_key" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_month_year_key" UNIQUE ("user_id", "month", "year");



ALTER TABLE ONLY "public"."pii_access_permissions"
    ADD CONSTRAINT "pii_access_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pii_access_permissions"
    ADD CONSTRAINT "pii_access_permissions_tenant_id_user_id_key" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."pii_audit_logs"
    ADD CONSTRAINT "pii_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles_private"
    ADD CONSTRAINT "profiles_private_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."push_device_tokens"
    ADD CONSTRAINT "push_device_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_device_tokens"
    ADD CONSTRAINT "push_device_tokens_user_id_device_token_key" UNIQUE ("user_id", "device_token");



ALTER TABLE ONLY "public"."push_notification_queue"
    ADD CONSTRAINT "push_notification_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_finalizations"
    ADD CONSTRAINT "schedule_finalizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_finalizations"
    ADD CONSTRAINT "schedule_finalizations_tenant_sector_month_year_key" UNIQUE ("tenant_id", "sector_id", "month", "year");



ALTER TABLE ONLY "public"."schedule_movements"
    ADD CONSTRAINT "schedule_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sector_expenses"
    ADD CONSTRAINT "sector_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sector_memberships"
    ADD CONSTRAINT "sector_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sector_memberships"
    ADD CONSTRAINT "sector_memberships_sector_id_user_id_key" UNIQUE ("sector_id", "user_id");



ALTER TABLE ONLY "public"."sector_revenues"
    ADD CONSTRAINT "sector_revenues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sector_revenues"
    ADD CONSTRAINT "sector_revenues_tenant_id_sector_id_month_year_key" UNIQUE ("tenant_id", "sector_id", "month", "year");



ALTER TABLE ONLY "public"."sectors"
    ADD CONSTRAINT "sectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sectors"
    ADD CONSTRAINT "sectors_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."shift_assignment_locations"
    ADD CONSTRAINT "shift_assignment_locations_pkey" PRIMARY KEY ("assignment_id");



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_shift_id_user_id_key" UNIQUE ("shift_id", "user_id");



ALTER TABLE ONLY "public"."shift_entries"
    ADD CONSTRAINT "shift_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_offers"
    ADD CONSTRAINT "shift_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_offers"
    ADD CONSTRAINT "shift_offers_shift_id_user_id_key" UNIQUE ("shift_id", "user_id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."swap_requests"
    ADD CONSTRAINT "swap_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_setting_key_key" UNIQUE ("setting_key");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."user_sector_values"
    ADD CONSTRAINT "user_sector_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_sector_values"
    ADD CONSTRAINT "user_sector_values_tenant_sector_user_month_year_key" UNIQUE ("tenant_id", "sector_id", "user_id", "month", "year");



CREATE INDEX "idx_absences_dates" ON "public"."absences" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_absences_tenant_id" ON "public"."absences" USING "btree" ("tenant_id");



CREATE INDEX "idx_absences_user_id" ON "public"."absences" USING "btree" ("user_id");



CREATE INDEX "idx_calendar_sync_shift" ON "public"."calendar_sync_events" USING "btree" ("shift_id");



CREATE INDEX "idx_calendar_sync_user" ON "public"."calendar_sync_events" USING "btree" ("user_id");



CREATE INDEX "idx_conflict_resolutions_plantonista" ON "public"."conflict_resolutions" USING "btree" ("plantonista_id");



CREATE INDEX "idx_conflict_resolutions_tenant_date" ON "public"."conflict_resolutions" USING "btree" ("tenant_id", "conflict_date");



CREATE INDEX "idx_login_cpf_rate_limits_last_attempt" ON "public"."login_cpf_rate_limits" USING "btree" ("last_attempt_at" DESC);



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id", "read_at") WHERE ("read_at" IS NULL);



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_payment_access_permissions_lookup" ON "public"."payment_access_permissions" USING "btree" ("user_id", "tenant_id", "expires_at");



CREATE INDEX "idx_pii_access_permissions_lookup" ON "public"."pii_access_permissions" USING "btree" ("user_id", "tenant_id", "expires_at");



CREATE INDEX "idx_pii_audit_logs_created_at" ON "public"."pii_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_pii_audit_logs_user_id" ON "public"."pii_audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_push_device_tokens_active" ON "public"."push_device_tokens" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_push_device_tokens_tenant" ON "public"."push_device_tokens" USING "btree" ("tenant_id");



CREATE INDEX "idx_push_device_tokens_user" ON "public"."push_device_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_push_queue_scheduled" ON "public"."push_notification_queue" USING "btree" ("scheduled_for") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_push_queue_user" ON "public"."push_notification_queue" USING "btree" ("user_id");



CREATE INDEX "idx_schedule_finalizations_sector" ON "public"."schedule_finalizations" USING "btree" ("sector_id");



CREATE INDEX "idx_schedule_finalizations_tenant_month" ON "public"."schedule_finalizations" USING "btree" ("tenant_id", "year", "month");



CREATE INDEX "idx_schedule_movements_tenant_month" ON "public"."schedule_movements" USING "btree" ("tenant_id", "year", "month");



CREATE INDEX "idx_schedule_movements_user" ON "public"."schedule_movements" USING "btree" ("user_id");



CREATE INDEX "idx_sector_expenses_lookup" ON "public"."sector_expenses" USING "btree" ("tenant_id", "sector_id", "year", "month");



CREATE INDEX "idx_sector_memberships_sector_id" ON "public"."sector_memberships" USING "btree" ("sector_id");



CREATE INDEX "idx_sector_memberships_user_id" ON "public"."sector_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_sector_revenues_lookup" ON "public"."sector_revenues" USING "btree" ("tenant_id", "year", "month");



CREATE INDEX "idx_sectors_tenant_id" ON "public"."sectors" USING "btree" ("tenant_id");



CREATE INDEX "idx_shift_assignments_tenant_user_shift" ON "public"."shift_assignments" USING "btree" ("tenant_id", "user_id", "shift_id");



CREATE INDEX "idx_shifts_sector_id" ON "public"."shifts" USING "btree" ("sector_id");



CREATE INDEX "idx_shifts_tenant_date" ON "public"."shifts" USING "btree" ("tenant_id", "shift_date");



CREATE INDEX "idx_user_sector_values_temporal" ON "public"."user_sector_values" USING "btree" ("tenant_id", "sector_id", "user_id", "month", "year");



CREATE INDEX "shift_entries_tenant_date_idx" ON "public"."shift_entries" USING "btree" ("tenant_id", "data");



CREATE INDEX "shift_entries_tenant_plantonista_idx" ON "public"."shift_entries" USING "btree" ("tenant_id", "plantonista_id");



CREATE UNIQUE INDEX "shift_entries_unique" ON "public"."shift_entries" USING "btree" ("tenant_id", "setor_id", "data", "plantonista_id");



CREATE OR REPLACE TRIGGER "audit_profiles_private" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles_private" FOR EACH ROW EXECUTE FUNCTION "public"."audit_profiles_private_changes"();



CREATE OR REPLACE TRIGGER "log_gps_grant_trigger" AFTER INSERT ON "public"."gps_access_grants" FOR EACH ROW EXECUTE FUNCTION "public"."log_gps_grant"();



CREATE OR REPLACE TRIGGER "log_payment_grant_trigger" AFTER INSERT ON "public"."payment_access_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."log_pii_grant"();



CREATE OR REPLACE TRIGGER "log_pii_grant_trigger" AFTER INSERT ON "public"."pii_access_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."log_pii_grant"();



CREATE OR REPLACE TRIGGER "on_membership_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."update_tenant_user_count"();



CREATE OR REPLACE TRIGGER "protect_profile_security_fields_trigger" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_security_fields"();



CREATE OR REPLACE TRIGGER "restrict_user_assignment_update" BEFORE UPDATE ON "public"."shift_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."restrict_user_assignment_update"();



CREATE OR REPLACE TRIGGER "restrict_user_assignment_update_trigger" BEFORE UPDATE ON "public"."shift_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."restrict_user_assignment_update"();



CREATE OR REPLACE TRIGGER "trg_enforce_profiles_private_tenant" BEFORE INSERT OR UPDATE ON "public"."profiles_private" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_profiles_private_tenant"();



CREATE OR REPLACE TRIGGER "trg_payments_prevent_sensitive_fk_updates" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_sensitive_fk_updates"();



CREATE OR REPLACE TRIGGER "trg_prevent_profiles_private_tenant_change" BEFORE UPDATE ON "public"."profiles_private" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profiles_private_tenant_change"();



CREATE OR REPLACE TRIGGER "trg_validate_shift_assignment_location_row" BEFORE INSERT OR UPDATE ON "public"."shift_assignment_locations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_shift_assignment_location_row"();



CREATE OR REPLACE TRIGGER "trigger_cancel_shift_reminders" BEFORE DELETE ON "public"."shift_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."cancel_shift_reminders"();



CREATE OR REPLACE TRIGGER "trigger_schedule_shift_reminders" AFTER INSERT OR UPDATE OF "user_id" ON "public"."shift_assignments" FOR EACH ROW WHEN (("new"."status" = ANY (ARRAY['assigned'::"text", 'confirmed'::"text"]))) EXECUTE FUNCTION "public"."schedule_shift_reminders"();



CREATE OR REPLACE TRIGGER "update_absences_updated_at" BEFORE UPDATE ON "public"."absences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_calendar_sync_updated_at" BEFORE UPDATE ON "public"."calendar_sync_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_memberships_updated_at" BEFORE UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_notification_preferences_updated_at" BEFORE UPDATE ON "public"."user_notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_private_updated_at" BEFORE UPDATE ON "public"."profiles_private" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_push_device_tokens_updated_at" BEFORE UPDATE ON "public"."push_device_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sectors_updated_at" BEFORE UPDATE ON "public"."sectors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_shift_assignment_locations_updated_at" BEFORE UPDATE ON "public"."shift_assignment_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_shift_assignments_updated_at" BEFORE UPDATE ON "public"."shift_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_shift_entries_updated_at" BEFORE UPDATE ON "public"."shift_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_shift_offers_updated_at" BEFORE UPDATE ON "public"."shift_offers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_shifts_updated_at" BEFORE UPDATE ON "public"."shifts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_swap_requests_updated_at" BEFORE UPDATE ON "public"."swap_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tenants_updated_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_sector_values_updated_at" BEFORE UPDATE ON "public"."user_sector_values" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_sync_events"
    ADD CONSTRAINT "calendar_sync_events_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_sync_events"
    ADD CONSTRAINT "calendar_sync_events_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_sync_events"
    ADD CONSTRAINT "calendar_sync_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_sync_events"
    ADD CONSTRAINT "calendar_sync_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conflict_resolutions"
    ADD CONSTRAINT "conflict_resolutions_plantonista_id_fkey" FOREIGN KEY ("plantonista_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conflict_resolutions"
    ADD CONSTRAINT "conflict_resolutions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conflict_resolutions"
    ADD CONSTRAINT "conflict_resolutions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gps_access_grants"
    ADD CONSTRAINT "gps_access_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."gps_access_grants"
    ADD CONSTRAINT "gps_access_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gps_access_grants"
    ADD CONSTRAINT "gps_access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_shift_assignment_id_fkey" FOREIGN KEY ("shift_assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pii_access_permissions"
    ADD CONSTRAINT "pii_access_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."pii_access_permissions"
    ADD CONSTRAINT "pii_access_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pii_access_permissions"
    ADD CONSTRAINT "pii_access_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles_private"
    ADD CONSTRAINT "profiles_private_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_device_tokens"
    ADD CONSTRAINT "push_device_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_device_tokens"
    ADD CONSTRAINT "push_device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_notification_queue"
    ADD CONSTRAINT "push_notification_queue_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_notification_queue"
    ADD CONSTRAINT "push_notification_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_notification_queue"
    ADD CONSTRAINT "push_notification_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_finalizations"
    ADD CONSTRAINT "schedule_finalizations_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sector_memberships"
    ADD CONSTRAINT "sector_memberships_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sector_memberships"
    ADD CONSTRAINT "sector_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sector_memberships"
    ADD CONSTRAINT "sector_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sectors"
    ADD CONSTRAINT "sectors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_assignment_locations"
    ADD CONSTRAINT "shift_assignment_locations_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_assignment_locations"
    ADD CONSTRAINT "shift_assignment_locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_assignment_locations"
    ADD CONSTRAINT "shift_assignment_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_entries"
    ADD CONSTRAINT "shift_entries_plantonista_id_fkey" FOREIGN KEY ("plantonista_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."shift_entries"
    ADD CONSTRAINT "shift_entries_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."sectors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."shift_entries"
    ADD CONSTRAINT "shift_entries_source_assignment_id_fkey" FOREIGN KEY ("source_assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shift_entries"
    ADD CONSTRAINT "shift_entries_source_shift_id_fkey" FOREIGN KEY ("source_shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shift_entries"
    ADD CONSTRAINT "shift_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_offers"
    ADD CONSTRAINT "shift_offers_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_offers"
    ADD CONSTRAINT "shift_offers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."shift_offers"
    ADD CONSTRAINT "shift_offers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."swap_requests"
    ADD CONSTRAINT "swap_requests_origin_assignment_id_fkey" FOREIGN KEY ("origin_assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swap_requests"
    ADD CONSTRAINT "swap_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."swap_requests"
    ADD CONSTRAINT "swap_requests_requester_id_profiles_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."swap_requests"
    ADD CONSTRAINT "swap_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."swap_requests"
    ADD CONSTRAINT "swap_requests_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."swap_requests"
    ADD CONSTRAINT "swap_requests_target_user_id_profiles_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."swap_requests"
    ADD CONSTRAINT "swap_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sector_values"
    ADD CONSTRAINT "user_sector_values_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sector_values"
    ADD CONSTRAINT "user_sector_values_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sector_values"
    ADD CONSTRAINT "user_sector_values_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete assignment locations" ON "public"."shift_assignment_locations" FOR DELETE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Admins can delete shift entries" ON "public"."shift_entries" FOR DELETE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Admins can insert members" ON "public"."memberships" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "memberships_1"
  WHERE (("memberships_1"."user_id" = "auth"."uid"()) AND ("memberships_1"."tenant_id" = "memberships_1"."tenant_id") AND ("memberships_1"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "Admins can manage roles" ON "public"."user_roles" USING ((("auth"."uid"() IS NOT NULL) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins can view all roles" ON "public"."user_roles" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Apenas admins podem adicionar membros" ON "public"."memberships" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "memberships_1"
  WHERE (("memberships_1"."user_id" = "auth"."uid"()) AND ("memberships_1"."tenant_id" = "memberships_1"."tenant_id") AND ("memberships_1"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "Apenas admins podem atualizar membros" ON "public"."memberships" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "memberships_1"
  WHERE (("memberships_1"."user_id" = "auth"."uid"()) AND ("memberships_1"."tenant_id" = "memberships_1"."tenant_id") AND ("memberships_1"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "Authenticated users can create tenants" ON "public"."tenants" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view active plans" ON "public"."plans" FOR SELECT TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("active" = true)));



CREATE POLICY "Authenticated users can view system settings" ON "public"."system_settings" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authorized users can view profiles" ON "public"."profiles" FOR SELECT USING ("public"."can_view_profile"("id"));



CREATE POLICY "Block anon access on absences" ON "public"."absences" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on conflict_resolutions" ON "public"."conflict_resolutions" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on gps_access_grants" ON "public"."gps_access_grants" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on gps_access_logs" ON "public"."gps_access_logs" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on login_cpf_rate_limits" ON "public"."login_cpf_rate_limits" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on memberships" ON "public"."memberships" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on notifications" ON "public"."notifications" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on payment_access_permissions" ON "public"."payment_access_permissions" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on payments" ON "public"."payments" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on pii_access_permissions" ON "public"."pii_access_permissions" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on pii_audit_logs" ON "public"."pii_audit_logs" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on plans" ON "public"."plans" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on profiles" ON "public"."profiles" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on profiles_private" ON "public"."profiles_private" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on schedule_finalizations" ON "public"."schedule_finalizations" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on schedule_movements" ON "public"."schedule_movements" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on sector_expenses" ON "public"."sector_expenses" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on sector_memberships" ON "public"."sector_memberships" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on sector_revenues" ON "public"."sector_revenues" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on sectors" ON "public"."sectors" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on shift_assignment_locations" ON "public"."shift_assignment_locations" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on shift_assignments" ON "public"."shift_assignments" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on shift_entries" ON "public"."shift_entries" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on shift_offers" ON "public"."shift_offers" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on shifts" ON "public"."shifts" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on super_admins" ON "public"."super_admins" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on swap_requests" ON "public"."swap_requests" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on system_settings" ON "public"."system_settings" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on tenants" ON "public"."tenants" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on user_roles" ON "public"."user_roles" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block anon access on user_sector_values" ON "public"."user_sector_values" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block authenticated access on login_cpf_rate_limits" ON "public"."login_cpf_rate_limits" AS RESTRICTIVE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Finance can view tenant payments" ON "public"."payments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (((("user_id" = "auth"."uid"()) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")) OR "public"."has_payment_access"("tenant_id")));



CREATE POLICY "Finance/admin can delete payments" ON "public"."payments" FOR DELETE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."has_payment_access"("tenant_id"))));



CREATE POLICY "Finance/admin can insert payments" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."has_payment_access"("tenant_id"))));



CREATE POLICY "Finance/admin can update payments" ON "public"."payments" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."has_payment_access"("tenant_id")))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."has_payment_access"("tenant_id"))));



CREATE POLICY "No client deletes to profiles" ON "public"."profiles" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "No client deletes to super_admins" ON "public"."super_admins" FOR DELETE USING (false);



CREATE POLICY "No client inserts to super_admins" ON "public"."super_admins" FOR INSERT WITH CHECK (false);



CREATE POLICY "No client modifications to audit logs" ON "public"."pii_audit_logs" USING (false) WITH CHECK (false);



CREATE POLICY "No client updates to super_admins" ON "public"."super_admins" FOR UPDATE USING (false);



CREATE POLICY "Owner can delete own private profile" ON "public"."profiles_private" FOR DELETE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Owner can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "id")));



CREATE POLICY "Owner can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "id")));



CREATE POLICY "Owner can view own private profile" ON "public"."profiles_private" FOR SELECT TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "user_id") AND ("tenant_id" IS NOT NULL)));



CREATE POLICY "Owner can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "id")));



CREATE POLICY "Owner or tenant admin can insert profiles_private" ON "public"."profiles_private" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" IS NOT NULL) AND ((("auth"."uid"() = "user_id") AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")) OR "public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."is_super_admin"("auth"."uid"()))));



CREATE POLICY "Owner or tenant admin can update profiles_private" ON "public"."profiles_private" FOR UPDATE TO "authenticated" USING ((("tenant_id" IS NOT NULL) AND ((("auth"."uid"() = "user_id") AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")) OR "public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."is_super_admin"("auth"."uid"())))) WITH CHECK ((("tenant_id" IS NOT NULL) AND ((("auth"."uid"() = "user_id") AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")) OR "public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."is_super_admin"("auth"."uid"()))));



CREATE POLICY "Owner or tenant admin can view profiles_private" ON "public"."profiles_private" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NOT NULL) AND ((("auth"."uid"() = "user_id") AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")) OR "public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."is_super_admin"("auth"."uid"()))));



CREATE POLICY "Require authentication for absences" ON "public"."absences" AS RESTRICTIVE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Require authentication for payments" ON "public"."payments" AS RESTRICTIVE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Require authentication for profiles" ON "public"."profiles" AS RESTRICTIVE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Require authentication for profiles_private" ON "public"."profiles_private" AS RESTRICTIVE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Require authentication for shift_assignment_locations" ON "public"."shift_assignment_locations" AS RESTRICTIVE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Require authentication for shifts" ON "public"."shifts" AS RESTRICTIVE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Require authentication for tenants" ON "public"."tenants" AS RESTRICTIVE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Require tenant membership for all shifts access" ON "public"."shifts" AS RESTRICTIVE TO "authenticated" USING ("public"."is_tenant_member"("auth"."uid"(), "tenant_id")) WITH CHECK ("public"."is_tenant_member"("auth"."uid"(), "tenant_id"));



CREATE POLICY "Super admins can manage gps_access_grants" ON "public"."gps_access_grants" TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can manage payment access" ON "public"."payment_access_permissions" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can manage pii_access_permissions" ON "public"."pii_access_permissions" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can manage system settings" ON "public"."system_settings" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can view audit logs" ON "public"."pii_audit_logs" FOR SELECT USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can view gps access logs" ON "public"."gps_access_logs" FOR SELECT USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can view super_admins table" ON "public"."super_admins" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "System can manage notification queue" ON "public"."push_notification_queue" USING (("public"."is_super_admin"("auth"."uid"()) OR "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admin can update profile in their tenant" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND "public"."can_admin_access_profile"("id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."can_admin_access_profile"("id")));



CREATE POLICY "Tenant admins can manage all absences" ON "public"."absences" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage all assignments" ON "public"."shift_assignments" TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage all notifications" ON "public"."notifications" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage all offers" ON "public"."shift_offers" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage all swap requests" ON "public"."swap_requests" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage assignment locations" ON "public"."shift_assignment_locations" TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("tenant_id" IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("tenant_id" IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage conflict resolutions" ON "public"."conflict_resolutions" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage memberships" ON "public"."memberships" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage schedule finalizations" ON "public"."schedule_finalizations" USING ("public"."is_tenant_admin"("auth"."uid"(), "tenant_id")) WITH CHECK ("public"."is_tenant_admin"("auth"."uid"(), "tenant_id"));



CREATE POLICY "Tenant admins can manage schedule movements" ON "public"."schedule_movements" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage sector expenses" ON "public"."sector_expenses" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage sector memberships" ON "public"."sector_memberships" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage sector revenues" ON "public"."sector_revenues" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage sectors" ON "public"."sectors" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage shift entries" ON "public"."shift_entries" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage shifts" ON "public"."shifts" TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can manage user sector values" ON "public"."user_sector_values" USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant admins can update their tenant" ON "public"."tenants" FOR UPDATE USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "id")));



CREATE POLICY "Tenant admins can view gps access logs" ON "public"."gps_access_logs" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."has_gabs_bypass"("auth"."uid"())));



CREATE POLICY "Tenant admins can view gps_access_grants" ON "public"."gps_access_grants" FOR SELECT TO "authenticated" USING ("public"."is_tenant_admin"("auth"."uid"(), "tenant_id"));



CREATE POLICY "Tenant admins can view pii_access_permissions" ON "public"."pii_access_permissions" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_admin"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant members can create notifications" ON "public"."notifications" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant members can read" ON "public"."tenants" FOR SELECT USING (("id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."active" = true)))));



CREATE POLICY "Tenant members can view schedule finalizations" ON "public"."schedule_finalizations" FOR SELECT USING ("public"."is_tenant_member"("auth"."uid"(), "tenant_id"));



CREATE POLICY "Tenant members can view schedule movements" ON "public"."schedule_movements" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant members can view sector expenses" ON "public"."sector_expenses" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant members can view sector memberships" ON "public"."sector_memberships" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant members can view sector revenues" ON "public"."sector_revenues" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Tenant members can view sectors" ON "public"."sectors" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can cancel their own pending offers" ON "public"."shift_offers" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));



CREATE POLICY "Users can create offers for available shifts" ON "public"."shift_offers" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can create swap requests in tenant" ON "public"."swap_requests" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("requester_id" = "auth"."uid"())));



CREATE POLICY "Users can create their own absence requests" ON "public"."absences" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can delete pending absences" ON "public"."absences" FOR DELETE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text") AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can delete their own notifications" ON "public"."notifications" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can insert own assignment locations" ON "public"."shift_assignment_locations" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can insert their own membership when creating tenant" ON "public"."memberships" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can manage their own calendar sync events" ON "public"."calendar_sync_events" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own device tokens" ON "public"."push_device_tokens" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own notification preferences" ON "public"."user_notification_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update pending absences" ON "public"."absences" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text") AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text") AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can update their own assignment locations" ON "public"."shift_assignment_locations" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can update their own checkin/checkout" ON "public"."shift_assignments" FOR UPDATE USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can update their pending requests" ON "public"."swap_requests" FOR UPDATE USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("requester_id" = "auth"."uid"()) AND ("status" = 'pending'::"public"."swap_status")));



CREATE POLICY "Users can view members of their tenant" ON "public"."memberships" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "memberships_1"."tenant_id"
   FROM "public"."memberships" "memberships_1"
  WHERE ("memberships_1"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view memberships in their tenants" ON "public"."memberships" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can view offers for their tenant" ON "public"."shift_offers" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can view own gps access logs" ON "public"."gps_access_logs" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("target_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own membership or admins see all" ON "public"."memberships" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (("user_id" = "auth"."uid"()) OR "public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."has_gabs_bypass"("auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"()))));



CREATE POLICY "Users can view own payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "id")));



CREATE POLICY "Users can view own recent locations" ON "public"."shift_assignment_locations" AS RESTRICTIVE FOR SELECT USING (("public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("user_id" = "auth"."uid"()) AND ("created_at" > ("now"() - '12:00:00'::interval))));



COMMENT ON POLICY "Users can view own recent locations" ON "public"."shift_assignment_locations" IS 'Users can only view their own GPS data from the last 12 hours. Admins and users with gps_access_grants MUST use get_assignment_location_with_audit() RPC which logs all access to gps_access_logs.';



CREATE POLICY "Users can view shift assignments in their sectors" ON "public"."shift_assignments" FOR SELECT TO "authenticated" USING (("public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."is_super_admin"("auth"."uid"()) OR "public"."has_gabs_bypass"("auth"."uid"()) OR ("user_id" = "auth"."uid"()) OR "public"."is_sector_member_of_shift"("shift_id", "auth"."uid"()))));



CREATE POLICY "Users can view shift entries in their sectors" ON "public"."shift_entries" FOR SELECT TO "authenticated" USING (("public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR "public"."is_super_admin"("auth"."uid"()) OR ("plantonista_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."sector_memberships" "sm"
  WHERE (("sm"."sector_id" = "shift_entries"."setor_id") AND ("sm"."tenant_id" = "shift_entries"."tenant_id") AND ("sm"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can view shifts in their sectors or assigned to them" ON "public"."shifts" FOR SELECT TO "authenticated" USING (("public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("public"."has_gabs_bypass"("auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"()) OR "public"."is_tenant_admin"("auth"."uid"(), "tenant_id") OR (EXISTS ( SELECT 1
   FROM "public"."sector_memberships" "sm"
  WHERE (("sm"."sector_id" = "shifts"."sector_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."tenant_id" = "shifts"."tenant_id")))) OR "public"."is_assigned_to_shift"("id", "auth"."uid"()))));



CREATE POLICY "Users can view swap requests in tenant" ON "public"."swap_requests" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND (("requester_id" = "auth"."uid"()) OR ("target_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view tenants they belong to" ON "public"."tenants" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "id")));



CREATE POLICY "Users can view their absences in tenant" ON "public"."absences" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Users can view their own notifications" ON "public"."push_notification_queue" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own role" ON "public"."user_roles" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can view their own sector values" ON "public"."user_sector_values" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "user_id") AND "public"."is_tenant_member"("auth"."uid"(), "tenant_id")));



CREATE POLICY "Usuários podem ver membros do seu tenant" ON "public"."memberships" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "memberships_1"."tenant_id"
   FROM "public"."memberships" "memberships_1"
  WHERE ("memberships_1"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."absences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_sync_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conflict_resolutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gps_access_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gps_access_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_cpf_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_access_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pii_access_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pii_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles_private" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_device_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_notification_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_finalizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sector_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sector_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sector_revenues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sectors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_assignment_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_offers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."super_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."swap_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_sector_values" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."add_member"("member_email" "text", "member_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_member"("member_email" "text", "member_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_member"("member_email" "text", "member_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_member_to_tenant"("member_email" "text", "member_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_member_to_tenant"("member_email" "text", "member_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_member_to_tenant"("member_email" "text", "member_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_tenant_member"("member_email" "text", "member_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_tenant_member"("member_email" "text", "member_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_tenant_member"("member_email" "text", "member_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_profiles_private_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_profiles_private_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_profiles_private_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_trial_end_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_trial_end_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_trial_end_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_payment"("_payment_tenant_id" "uuid", "_payment_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_payment"("_payment_tenant_id" "uuid", "_payment_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_payment"("_payment_tenant_id" "uuid", "_payment_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_add_user_to_tenant"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_add_user_to_tenant"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_add_user_to_tenant"("_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_admin_access_profile"("_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_admin_access_profile"("_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_admin_access_profile"("_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_profile"("_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_profile"("_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_profile"("_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_shift"("_shift_id" "uuid", "_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_shift"("_shift_id" "uuid", "_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_shift"("_shift_id" "uuid", "_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_shift_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_shift_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_shift_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_tenant_with_admin"("_name" "text", "_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_tenant_with_admin"("_name" "text", "_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_tenant_with_admin"("_name" "text", "_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."decide_swap_request"("_swap_request_id" "uuid", "_decision" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."decide_swap_request"("_swap_request_id" "uuid", "_decision" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_swap_request"("_swap_request_id" "uuid", "_decision" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_profiles_private_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_profiles_private_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_profiles_private_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_tenants_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_tenants_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_tenants_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_assignment_location_with_audit"("_assignment_id" "uuid", "_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_assignment_location_with_audit"("_assignment_id" "uuid", "_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_assignment_location_with_audit"("_assignment_id" "uuid", "_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_gabs_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_gabs_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_gabs_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_profile_private_with_audit"("_user_id" "uuid", "_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_profile_private_with_audit"("_user_id" "uuid", "_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profile_private_with_audit"("_user_id" "uuid", "_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_shift_assignments_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shift_assignments_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shift_assignments_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_shift_assignments_without_gps"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shift_assignments_without_gps"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shift_assignments_without_gps"("_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_shift_offers_pending_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shift_offers_pending_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shift_offers_pending_range"("_tenant_id" "uuid", "_start" "date", "_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_shift_roster"("_tenant_id" "uuid", "_start" "date", "_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shift_roster"("_tenant_id" "uuid", "_start" "date", "_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shift_roster"("_tenant_id" "uuid", "_start" "date", "_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_shift_tenant_id"("_shift_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shift_tenant_id"("_shift_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shift_tenant_id"("_shift_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_taken_shift_ids"("_tenant_id" "uuid", "_start" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_taken_shift_ids"("_tenant_id" "uuid", "_start" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_taken_shift_ids"("_tenant_id" "uuid", "_start" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_access_status"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_access_status"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_access_status"("_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_member_names"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_member_names"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_member_names"("_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_subscription"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_subscription"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_subscription"("_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_tenants"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tenants"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tenants"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_gabs_bypass"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_gabs_bypass"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_gabs_bypass"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_gps_access"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_gps_access"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_gps_access"("_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_gps_access"("_user_id" "uuid", "_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_gps_access"("_user_id" "uuid", "_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_gps_access"("_user_id" "uuid", "_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_payment_access"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_payment_access"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_payment_access"("_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_payment_access"("_user_id" "uuid", "_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_payment_access"("_user_id" "uuid", "_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_payment_access"("_user_id" "uuid", "_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_pii_access"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_pii_access"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_pii_access"("_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_pii_access"("_user_id" "uuid", "_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_pii_access"("_user_id" "uuid", "_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_pii_access"("_user_id" "uuid", "_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_assigned_to_shift"("_shift_id" "uuid", "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_assigned_to_shift"("_shift_id" "uuid", "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_assigned_to_shift"("_shift_id" "uuid", "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_sector_member_of_shift"("_shift_id" "uuid", "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_sector_member_of_shift"("_shift_id" "uuid", "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_sector_member_of_shift"("_shift_id" "uuid", "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_tenant_access_active"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tenant_access_active"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tenant_access_active"("_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_tenant_admin"("_user_id" "uuid", "_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tenant_admin"("_user_id" "uuid", "_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tenant_admin"("_user_id" "uuid", "_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_tenant_member"("_user_id" "uuid", "_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tenant_member"("_user_id" "uuid", "_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tenant_member"("_user_id" "uuid", "_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_gps_grant"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_gps_grant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_gps_grant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_pii_grant"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_pii_grant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_pii_grant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_profiles_private_tenant_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_profiles_private_tenant_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_profiles_private_tenant_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_sensitive_fk_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_sensitive_fk_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_sensitive_fk_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_profile_security_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_profile_security_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_profile_security_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restrict_user_assignment_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."restrict_user_assignment_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restrict_user_assignment_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."schedule_shift_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."schedule_shift_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_shift_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tenant_access"("_tenant_id" "uuid", "_billing_status" "text", "_is_unlimited" boolean, "_trial_ends_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_access"("_tenant_id" "uuid", "_billing_status" "text", "_is_unlimited" boolean, "_trial_ends_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_access"("_tenant_id" "uuid", "_billing_status" "text", "_is_unlimited" boolean, "_trial_ends_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tenant_user_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_user_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_user_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_active_membership"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_active_membership"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_active_membership"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_shift_assignment_location_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_shift_assignment_location_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_shift_assignment_location_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_schedule_reopen_password"("_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_schedule_reopen_password"("_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_schedule_reopen_password"("_password" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."absences" TO "anon";
GRANT ALL ON TABLE "public"."absences" TO "authenticated";
GRANT ALL ON TABLE "public"."absences" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_sync_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_sync_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_sync_events" TO "service_role";



GRANT ALL ON TABLE "public"."conflict_resolutions" TO "anon";
GRANT ALL ON TABLE "public"."conflict_resolutions" TO "authenticated";
GRANT ALL ON TABLE "public"."conflict_resolutions" TO "service_role";



GRANT ALL ON TABLE "public"."gps_access_grants" TO "anon";
GRANT ALL ON TABLE "public"."gps_access_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."gps_access_grants" TO "service_role";



GRANT ALL ON TABLE "public"."gps_access_logs" TO "anon";
GRANT ALL ON TABLE "public"."gps_access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."gps_access_logs" TO "service_role";



GRANT ALL ON TABLE "public"."login_cpf_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."login_cpf_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."login_cpf_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_access_permissions" TO "anon";
GRANT ALL ON TABLE "public"."payment_access_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_access_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."pii_access_permissions" TO "anon";
GRANT ALL ON TABLE "public"."pii_access_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."pii_access_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."pii_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."pii_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."pii_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles_private" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles_private" TO "service_role";



GRANT ALL ON TABLE "public"."push_device_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_device_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_device_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."push_notification_queue" TO "anon";
GRANT ALL ON TABLE "public"."push_notification_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."push_notification_queue" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_finalizations" TO "anon";
GRANT ALL ON TABLE "public"."schedule_finalizations" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_finalizations" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_movements" TO "anon";
GRANT ALL ON TABLE "public"."schedule_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_movements" TO "service_role";



GRANT ALL ON TABLE "public"."sector_expenses" TO "anon";
GRANT ALL ON TABLE "public"."sector_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."sector_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."sector_memberships" TO "anon";
GRANT ALL ON TABLE "public"."sector_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."sector_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."sector_revenues" TO "anon";
GRANT ALL ON TABLE "public"."sector_revenues" TO "authenticated";
GRANT ALL ON TABLE "public"."sector_revenues" TO "service_role";



GRANT ALL ON TABLE "public"."sectors" TO "anon";
GRANT ALL ON TABLE "public"."sectors" TO "authenticated";
GRANT ALL ON TABLE "public"."sectors" TO "service_role";



GRANT ALL ON TABLE "public"."shift_assignment_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_assignment_locations" TO "service_role";



GRANT ALL ON TABLE "public"."shift_assignments" TO "anon";
GRANT ALL ON TABLE "public"."shift_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."shift_entries" TO "anon";
GRANT ALL ON TABLE "public"."shift_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_entries" TO "service_role";



GRANT ALL ON TABLE "public"."shift_offers" TO "anon";
GRANT ALL ON TABLE "public"."shift_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_offers" TO "service_role";



GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";



GRANT ALL ON TABLE "public"."super_admins" TO "anon";
GRANT ALL ON TABLE "public"."super_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."super_admins" TO "service_role";



GRANT ALL ON TABLE "public"."swap_requests" TO "anon";
GRANT ALL ON TABLE "public"."swap_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."swap_requests" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."user_notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_sector_values" TO "anon";
GRANT ALL ON TABLE "public"."user_sector_values" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sector_values" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































