-- Fix 1: Require authentication to view plans
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.plans;

CREATE POLICY "Authenticated users can view active plans" 
ON public.plans 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND active = true);

-- Fix 2: Ensure profiles_private INSERT is properly restricted
-- The existing policy already checks auth.uid() = user_id, but let's make it more explicit
DROP POLICY IF EXISTS "Users can upsert their own private profile" ON public.profiles_private;

CREATE POLICY "Users can insert their own private profile" 
ON public.profiles_private 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);

-- Also allow tenant admins to insert private profiles for users they manage
CREATE POLICY "Tenant admins can insert private profiles for their users" 
ON public.profiles_private 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND can_admin_access_profile(user_id)
);