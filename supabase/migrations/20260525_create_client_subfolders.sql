-- Subcarpetas dentro de cada cliente (ej. Isla → Tangamanga, Bernina...)
-- Ejecuta después de 20260525_create_clients_projects.sql

create table if not exists public.client_subfolders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (client_id, name)
);

alter table public.client_subfolders enable row level security;

create policy "Authenticated pueden leer subcarpetas"
  on public.client_subfolders
  for select
  to authenticated
  using (true);

create policy "Admins pueden gestionar subcarpetas"
  on public.client_subfolders
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

alter table public.projects
  add column if not exists subfolder_id uuid references public.client_subfolders(id) on delete cascade;

-- Crea subcarpeta "General" para proyectos existentes sin subcarpeta
insert into public.client_subfolders (client_id, name)
select distinct p.client_id, 'General'
from public.projects p
where p.client_id is not null
  and not exists (
    select 1
    from public.client_subfolders sf
    where sf.client_id = p.client_id
      and sf.name = 'General'
  );

update public.projects p
set subfolder_id = sf.id
from public.client_subfolders sf
where p.subfolder_id is null
  and sf.client_id = p.client_id
  and sf.name = 'General';

alter table public.projects
  drop constraint if exists projects_client_id_name_key;

alter table public.projects
  add constraint projects_subfolder_id_name_key unique (subfolder_id, name);

-- Mantener client_id como referencia rápida al cliente raíz
alter table public.projects
  alter column subfolder_id set not null;
