create table if not exists public.entregas (
  id           uuid        primary key default gen_random_uuid(),
  titulo       text        not null,
  proyecto     text,
  cliente      text,
  fecha        date        not null,
  hora         text,
  notas        text,
  color        text        not null default '#6366f1',
  created_by   uuid        references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.entregas enable row level security;

create policy "Todos leen entregas"
  on public.entregas for select to authenticated using (true);

create policy "Admins, editors y productores gestionan entregas"
  on public.entregas for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','productor')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','productor')));
