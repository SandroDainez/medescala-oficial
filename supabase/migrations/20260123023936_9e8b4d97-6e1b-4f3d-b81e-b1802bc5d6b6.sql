-- Create system_settings table for global settings like reopen password
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read settings (needed to verify password)
CREATE POLICY "Authenticated users can view system settings" 
ON public.system_settings 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Only super admins can manage settings
CREATE POLICY "Super admins can manage system settings" 
ON public.system_settings 
FOR ALL 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Insert default reopen password
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES ('schedule_reopen_password', 'reabrir2026', 'Senha necessária para reabrir escalas finalizadas');

-- Create function to verify reopen password (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.verify_schedule_reopen_password(_password TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings
    WHERE setting_key = 'schedule_reopen_password'
      AND setting_value = _password
  )
$$;