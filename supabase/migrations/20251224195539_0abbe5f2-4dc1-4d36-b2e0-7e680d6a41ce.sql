-- Adicionar campo para habilitar/desabilitar check-in por setor
ALTER TABLE public.sectors
ADD COLUMN checkin_enabled BOOLEAN NOT NULL DEFAULT false;