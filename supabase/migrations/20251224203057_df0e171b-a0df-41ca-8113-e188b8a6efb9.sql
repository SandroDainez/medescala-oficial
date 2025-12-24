-- Add must_change_password column to profiles
ALTER TABLE public.profiles 
ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

-- Add comment to explain the column
COMMENT ON COLUMN public.profiles.must_change_password IS 'When true, user must change password on next login';