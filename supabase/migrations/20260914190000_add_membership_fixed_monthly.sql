-- Valor mensal fixo: profissional pago por mês (valor único), não por plantão — ex.:
-- diaristas de UTI e nefrologista que passam visita.
--
-- Os plantões dessas pessoas continuam existindo na escala (com valor 0); o Financeiro
-- soma este valor UMA vez por mês de competência, independentemente da quantidade de
-- plantões. fixed_monthly_sector_id indica em que setor o custo entra (Rentabilidade);
-- quando nulo, o app usa o setor onde a pessoa teve mais plantões no período.

alter table public.memberships
  add column if not exists fixed_monthly_value numeric(12,2),
  add column if not exists fixed_monthly_sector_id uuid references public.sectors(id) on delete set null;

alter table public.memberships
  drop constraint if exists memberships_fixed_monthly_value_nonnegative;
alter table public.memberships
  add constraint memberships_fixed_monthly_value_nonnegative
  check (fixed_monthly_value is null or fixed_monthly_value >= 0);

comment on column public.memberships.fixed_monthly_value is
  'Valor mensal fixo (R$) pago uma vez por mês, independente de plantões. Nulo = pagamento por plantão.';
comment on column public.memberships.fixed_monthly_sector_id is
  'Setor ao qual o custo do valor mensal fixo é atribuído. Nulo = setor com mais plantões no período.';
