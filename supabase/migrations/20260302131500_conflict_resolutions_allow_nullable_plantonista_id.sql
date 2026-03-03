-- Permite registrar resolução de conflito mesmo quando o perfil do plantonista
-- não existe mais na tabela profiles (casos legados/importação/exclusão).

ALTER TABLE public.conflict_resolutions
  ALTER COLUMN plantonista_id DROP NOT NULL;

