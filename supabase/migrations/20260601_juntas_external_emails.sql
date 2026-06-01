alter table public.juntas
  add column if not exists external_emails text[] default '{}';
