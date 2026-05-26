-- Ejecuta este script en el SQL Editor de Supabase antes de usar /empleados

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido_paterno text not null,
  apellido_materno text,
  nickname text,
  email text not null,
  puesto text not null,
  sueldo_mensual numeric(12, 2) not null check (sueldo_mensual >= 0),
  fecha_ingreso date not null,
  created_at timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy "Admins pueden gestionar empleados"
  on public.employees
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
