-- Create enum for value status if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'value_status') THEN
    CREATE TYPE public.value_status AS ENUM ('COM_VALOR', 'SEM_VALOR');
  END IF;
END$$;

-- Shift entries table (flattened finance source of truth)
CREATE TABLE IF NOT EXISTS public.shift_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  setor_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE RESTRICT,
  escala_id UUID NULL,
  data DATE NOT NULL,
  plantonista_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  valor NUMERIC NULL,
  status_valor public.value_status NOT NULL DEFAULT 'SEM_VALOR',
  source_shift_id UUID NULL REFERENCES public.shifts(id) ON DELETE SET NULL,
  source_assignment_id UUID NULL REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Uniqueness: one entry per sector/day/plantonista
CREATE UNIQUE INDEX IF NOT EXISTS shift_entries_unique
ON public.shift_entries(tenant_id, setor_id, data, plantonista_id);

CREATE INDEX IF NOT EXISTS shift_entries_tenant_date_idx
ON public.shift_entries(tenant_id, data);

CREATE INDEX IF NOT EXISTS shift_entries_tenant_plantonista_idx
ON public.shift_entries(tenant_id, plantonista_id);

-- Enable RLS
ALTER TABLE public.shift_entries ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shift_entries' AND policyname='Tenant admins can manage shift entries'
  ) THEN
    CREATE POLICY "Tenant admins can manage shift entries"
    ON public.shift_entries
    FOR ALL
    USING (public.is_tenant_admin(auth.uid(), tenant_id))
    WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shift_entries' AND policyname='Users can view their own shift entries'
  ) THEN
    CREATE POLICY "Users can view their own shift entries"
    ON public.shift_entries
    FOR SELECT
    USING (auth.uid() = plantonista_id);
  END IF;
END$$;

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_shift_entries_updated_at'
  ) THEN
    CREATE TRIGGER update_shift_entries_updated_at
    BEFORE UPDATE ON public.shift_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END$$;