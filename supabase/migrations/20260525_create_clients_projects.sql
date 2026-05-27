-- Ejecuta este script en el SQL Editor de Supabase antes de usar /proyectos

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, name)
);

alter table public.clients enable row level security;
alter table public.projects enable row level security;

create policy "Authenticated pueden leer clientes"
  on public.clients
  for select
  to authenticated
  using (true);

create policy "Admins pueden gestionar clientes"
  on public.clients
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Authenticated pueden leer proyectos"
  on public.projects
  for select
  to authenticated
  using (true);

create policy "Admins pueden gestionar proyectos"
  on public.projects
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
