-- Add explicit anonymous SELECT blocking policies for maximum security

-- profiles: block anon select (defensive, in addition to existing "Deny anon select")
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Block anon select on profiles'
  ) THEN
    CREATE POLICY "Block anon select on profiles" 
    ON public.profiles 
    FOR SELECT 
    TO anon 
    USING (false);
  END IF;
END $$;

-- payments: block anon select
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'payments' 
    AND policyname = 'Block anon select on payments'
  ) THEN
    CREATE POLICY "Block anon select on payments" 
    ON public.payments 
    FOR SELECT 
    TO anon 
    USING (false);
  END IF;
END $$;

-- shift_assignment_locations: block anon select
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'shift_assignment_locations' 
    AND policyname = 'Block anon select on shift_assignment_locations'
  ) THEN
    CREATE POLICY "Block anon select on shift_assignment_locations" 
    ON public.shift_assignment_locations 
    FOR SELECT 
    TO anon 
    USING (false);
  END IF;
END $$;