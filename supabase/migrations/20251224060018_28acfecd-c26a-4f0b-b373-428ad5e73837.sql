-- Drop existing FK to auth.users and recreate pointing to profiles
ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_user_id_fkey;
ALTER TABLE public.memberships 
ADD CONSTRAINT memberships_user_id_profiles_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add FK for swap_requests
ALTER TABLE public.swap_requests 
ADD CONSTRAINT swap_requests_requester_id_profiles_fkey 
FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.swap_requests 
ADD CONSTRAINT swap_requests_target_user_id_profiles_fkey 
FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add FK for shift_assignments
ALTER TABLE public.shift_assignments 
ADD CONSTRAINT shift_assignments_user_id_profiles_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;