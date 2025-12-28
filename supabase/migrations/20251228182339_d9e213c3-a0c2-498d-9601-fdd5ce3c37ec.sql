-- Create trigger function to protect security-critical fields on profiles
CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS protect_profile_security_fields_trigger ON public.profiles;

-- Create trigger
CREATE TRIGGER protect_profile_security_fields_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_security_fields();