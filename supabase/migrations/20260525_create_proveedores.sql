-- Ejecuta este script en el SQL Editor de Supabase antes de usar /proveedores

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  empresa text,
  actividad text not null,
  email text not null,
  telefono text not null,
  created_at timestamptz not null default now()
);

alter table public.proveedores enable row level security;

create policy "Admins pueden gestionar proveedores"
  on public.proveedores
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
