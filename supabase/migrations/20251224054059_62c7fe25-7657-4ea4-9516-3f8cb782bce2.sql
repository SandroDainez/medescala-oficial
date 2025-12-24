
-- Create plans table
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_users integer NOT NULL DEFAULT 1,
  max_users integer NOT NULL,
  price_monthly numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  features jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on plans
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Plans are readable by all authenticated users
CREATE POLICY "Anyone can view active plans"
ON public.plans FOR SELECT
USING (active = true);

-- Insert default plans
INSERT INTO public.plans (name, min_users, max_users, price_monthly, features) VALUES
('Gratuito', 1, 5, 0, '["Até 5 usuários", "50 plantões/mês", "Suporte por email"]'),
('Profissional', 6, 25, 99, '["Até 25 usuários", "500 plantões/mês", "Suporte prioritário", "Exportação CSV/PDF"]'),
('Enterprise', 26, 100, 299, '["Até 100 usuários", "Plantões ilimitados", "Suporte 24/7", "API access", "Relatórios avançados"]');

-- Add new columns to tenants
ALTER TABLE public.tenants 
ADD COLUMN plan_id uuid REFERENCES public.plans(id),
ADD COLUMN billing_status text NOT NULL DEFAULT 'active',
ADD COLUMN trial_ends_at timestamp with time zone,
ADD COLUMN current_users_count integer NOT NULL DEFAULT 0;

-- Set default plan for existing tenants
UPDATE public.tenants 
SET plan_id = (SELECT id FROM public.plans WHERE name = 'Gratuito' LIMIT 1);

-- Make plan_id NOT NULL after setting defaults
ALTER TABLE public.tenants ALTER COLUMN plan_id SET NOT NULL;

-- Create function to update current_users_count
CREATE OR REPLACE FUNCTION public.update_tenant_user_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.tenants 
    SET current_users_count = (
      SELECT COUNT(*) FROM public.memberships 
      WHERE tenant_id = NEW.tenant_id AND active = true
    )
    WHERE id = NEW.tenant_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.tenants 
    SET current_users_count = (
      SELECT COUNT(*) FROM public.memberships 
      WHERE tenant_id = OLD.tenant_id AND active = true
    )
    WHERE id = OLD.tenant_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger to auto-update user count
CREATE TRIGGER on_membership_change
AFTER INSERT OR UPDATE OR DELETE ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_user_count();

-- Create function to check if tenant can add more users
CREATE OR REPLACE FUNCTION public.can_add_user_to_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.current_users_count < p.max_users
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id
$$;

-- Create function to get tenant subscription info
CREATE OR REPLACE FUNCTION public.get_tenant_subscription(_tenant_id uuid)
RETURNS TABLE(
  plan_name text,
  max_users integer,
  current_users integer,
  price_monthly numeric,
  billing_status text,
  trial_ends_at timestamp with time zone,
  features jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.name,
    p.max_users,
    t.current_users_count,
    p.price_monthly,
    t.billing_status,
    t.trial_ends_at,
    p.features
  FROM public.tenants t
  JOIN public.plans p ON p.id = t.plan_id
  WHERE t.id = _tenant_id
$$;

-- Update existing user counts
UPDATE public.tenants t
SET current_users_count = (
  SELECT COUNT(*) FROM public.memberships m 
  WHERE m.tenant_id = t.id AND m.active = true
);
