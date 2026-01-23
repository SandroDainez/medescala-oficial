-- =============================================================
-- SECURITY: Enable RLS on shift_assignment_locations table
-- This table stores sensitive GPS data for check-ins/check-outs
-- =============================================================

-- Enable Row Level Security on the table
ALTER TABLE public.shift_assignment_locations ENABLE ROW LEVEL SECURITY;

-- Force RLS for all roles including table owner
ALTER TABLE public.shift_assignment_locations FORCE ROW LEVEL SECURITY;