create table if not exists public.juntas (
  id          uuid        primary key default gen_random_uuid(),
  tipo        text        not null check (tipo in ('Brief','PPM','Junta Cliente')),
  fecha       date        not null,
  hora_inicio text        not null default '09:00',
  hora_fin    text,
  notas       text,
  created_by  uuid        references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.junta_attendees (
  junta_id    uuid not null references public.juntas(id)   on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  primary key (junta_id, employee_id)
);

alter table public.juntas          enable row level security;
alter table public.junta_attendees enable row level security;

create policy "Todos leen juntas"
  on public.juntas for select to authenticated using (true);

create policy "Todos leen asistentes a juntas"
  on public.junta_attendees for select to authenticated using (true);

create policy "Admins y editors gestionan juntas"
  on public.juntas for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor')));

create policy "Admins y editors gestionan asistentes"
  on public.junta_attendees for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor')));
