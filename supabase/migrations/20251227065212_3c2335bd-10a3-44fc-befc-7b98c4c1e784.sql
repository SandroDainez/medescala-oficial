-- Remove the restrictive check constraint that only allows checkin reminder types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;