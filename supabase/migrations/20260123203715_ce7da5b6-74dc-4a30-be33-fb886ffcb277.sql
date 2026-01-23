-- Adicionar coluna RQE (Registro de Qualificação de Especialidade) à tabela profiles_private
ALTER TABLE public.profiles_private ADD COLUMN IF NOT EXISTS rqe_enc bytea;