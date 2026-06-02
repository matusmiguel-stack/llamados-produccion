alter table public.entregas
  add column if not exists editores text[] default '{}';
