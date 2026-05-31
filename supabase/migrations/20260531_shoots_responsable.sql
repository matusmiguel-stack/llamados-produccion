-- Agrega campo responsable al llamado (shoot)
alter table public.shoots
  add column if not exists responsable text;
