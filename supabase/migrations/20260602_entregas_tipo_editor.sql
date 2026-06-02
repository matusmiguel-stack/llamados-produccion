alter table public.entregas
  add column if not exists tipo   text,
  add column if not exists editor text;
