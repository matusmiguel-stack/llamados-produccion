-- Agrega soporte para múltiples direcciones en la hoja de llamado
alter table public.hoja_llamado
  add column if not exists direcciones jsonb;
