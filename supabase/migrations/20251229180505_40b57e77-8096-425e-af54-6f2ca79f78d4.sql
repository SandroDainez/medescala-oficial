-- Add tenant_id to profiles_private for direct tenant isolation
ALTER TABLE public.profiles_private
ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Backfill tenant_id using one active membership (pick first by ordering since MIN doesn't work on UUID)
UPDATE public.profiles_private pp
SET tenant_id = sub.tenant_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, tenant_id
  FROM public.memberships
  WHERE active = true
  ORDER BY user_id, tenant_id
) sub
WHERE pp.user_id = sub.user_id
  AND pp.tenant_id IS NULL;

-- Helper: enforce tenant_id presence and membership validity
CREATE OR REPLACE FUNCTION public.enforce_profiles_private_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_enforce_profiles_private_tenant ON public.profiles_private;
CREATE TRIGGER trg_enforce_profiles_private_tenant
BEFORE INSERT OR UPDATE ON public.profiles_private
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profiles_private_tenant();

-- Tighten RLS to require tenant_id match directly (defense-in-depth)
DROP POLICY IF EXISTS "Tenant admin can view private profile in their tenant" ON public.profiles_private;
CREATE POLICY "Tenant admin can view private profile in their tenant"
ON public.profiles_private
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND public.is_tenant_admin(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant admin can update private profile in their tenant" ON public.profiles_private;
CREATE POLICY "Tenant admin can update private profile in their tenant"
ON public.profiles_private
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND public.is_tenant_admin(auth.uid(), tenant_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND tenant_id IS NOT NULL
  AND public.is_tenant_admin(auth.uid(), tenant_id)
);

-- Owners can still access their own row, but require tenant_id to exist to avoid orphaned rows
DROP POLICY IF EXISTS "Owner can view own private profile" ON public.profiles_private;
CREATE POLICY "Owner can view own private profile"
ON public.profiles_private
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND tenant_id IS NOT NULL
);

DROP POLICY IF EXISTS "Owner can update own private profile" ON public.profiles_private;
CREATE POLICY "Owner can update own private profile"
ON public.profiles_private
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND tenant_id IS NOT NULL
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND tenant_id IS NOT NULL
);

DROP POLICY IF EXISTS "Owner can insert own private profile" ON public.profiles_private;
CREATE POLICY "Owner can insert own private profile"
ON public.profiles_private
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND tenant_id IS NOT NULL
);

-- Prevent cross-tenant reassignment
CREATE OR REPLACE FUNCTION public.prevent_profiles_private_tenant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'profiles_private.tenant_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profiles_private_tenant_change ON public.profiles_private;
CREATE TRIGGER trg_prevent_profiles_private_tenant_change
BEFORE UPDATE ON public.profiles_private
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profiles_private_tenant_change();