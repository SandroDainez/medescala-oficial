-- Diarista / visitador: profissional que passa visita (diarista de UTI, especialista
-- como nefrologista) e não é plantonista fixo, mas pode eventualmente dar plantão.
--
-- Fica no vínculo com o serviço (memberships), e não no tipo de perfil: o tipo continua
-- "plantonista" para que ele possa ser escalado quando precisar (o trigger
-- enforce_plantonista_assignment só aceita profile_type = 'plantonista').
--
-- Uso no app: na importação de escalas, diaristas vêm desmarcados por padrão (não
-- entram), com opção de incluir; podem sempre ser escalados manualmente.

alter table public.memberships
  add column if not exists is_diarista boolean not null default false;

comment on column public.memberships.is_diarista is
  'Diarista/visitador (não é plantonista fixo): não entra por padrão na importação de escalas; pode ser escalado manualmente.';
