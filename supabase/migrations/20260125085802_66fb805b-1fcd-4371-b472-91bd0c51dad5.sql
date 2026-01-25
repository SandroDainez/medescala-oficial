-- =====================================================
-- FINAL FIXES: Field-level restrictions + user access to own logs
-- =====================================================

-- 1. Allow users to see GPS access logs about their OWN data
DROP POLICY IF EXISTS "Users can view own gps access logs" ON public.gps_access_logs;

CREATE POLICY "Users can view own gps access logs"
ON public.gps_access_logs
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (target_user_id = auth.uid());

-- 2. Add trigger to restrict shift_assignments UPDATE to only checkin/checkout fields
CREATE OR REPLACE FUNCTION public.restrict_user_assignment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If user is NOT admin, only allow checkin_at/checkout_at changes
  IF NOT public.is_tenant_admin(auth.uid(), OLD.tenant_id) 
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

DROP TRIGGER IF EXISTS restrict_user_assignment_update_trigger ON public.shift_assignments;
CREATE TRIGGER restrict_user_assignment_update_trigger
  BEFORE UPDATE ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_user_assignment_update();

-- 3. Add audit logging for profiles_private SELECT (using RPC approach)
-- Create function that logs access when called
CREATE OR REPLACE FUNCTION public.get_profile_private_with_audit(_user_id uuid, _tenant_id uuid)
RETURNS TABLE(
  user_id uuid,
  tenant_id uuid,
  cpf_enc bytea,
  crm_enc bytea,
  phone_enc bytea,
  address_enc bytea,
  bank_name_enc bytea,
  bank_agency_enc bytea,
  bank_account_enc bytea,
  pix_key_enc bytea,
  rqe_enc bytea
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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