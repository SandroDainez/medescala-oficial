create table if not exists public.professional_registry_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  crm text not null,
  uf text not null,
  verification_status text not null check (verification_status in ('verified', 'partial', 'pending_manual')),
  source_used text not null,
  regular boolean,
  found boolean not null default false,
  normalized_payload jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists idx_professional_registry_verifications_tenant_created
  on public.professional_registry_verifications (tenant_id, created_at desc);

create index if not exists idx_professional_registry_verifications_crm_uf
  on public.professional_registry_verifications (crm, uf, created_at desc);

create index if not exists idx_professional_registry_verifications_user
  on public.professional_registry_verifications (user_id, created_at desc);

alter table public.professional_registry_verifications enable row level security;

