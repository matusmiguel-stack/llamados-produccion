-- Agrega columna link a juntas para almacenar liga de Zoom/Meet/Teams
alter table public.juntas
  add column if not exists link text;
