-- Ensure Row Level Security is enabled on profiles_private (critical)
ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

-- Optional hardening: ensure even table owners bypass is prevented
ALTER TABLE public.profiles_private FORCE ROW LEVEL SECURITY;