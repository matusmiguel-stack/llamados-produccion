-- Agrega campo de responsable del proyecto
alter table public.projects
  add column if not exists responsable text;
