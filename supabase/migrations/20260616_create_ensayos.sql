-- Ensayos de la obra de teatro — solo admin crea/edita, todos ven
-- Ejecutar en el SQL Editor de Supabase

create table if not exists public.ensayos (
  id          uuid        primary key default gen_random_uuid(),
  titulo      text,
  fecha       date        not null,
  hora_inicio text,        -- null = todo el día
  hora_fin    text,
  all_day     boolean     not null default false,
  created_by  uuid        references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.ensayos enable row level security;

create policy "Todos leen ensayos"
  on public.ensayos for select to authenticated using (true);

create policy "Solo admin gestiona ensayos"
  on public.ensayos for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- Realtime
alter publication supabase_realtime add table public.ensayos;
