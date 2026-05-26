-- Ejecuta este script en el SQL Editor de Supabase

create table if not exists public.shoot_employees (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (shoot_id, employee_id)
);

alter table public.shoot_employees enable row level security;

create policy "Authenticated pueden leer shoot_employees"
  on public.shoot_employees
  for select
  to authenticated
  using (true);

create policy "Authenticated pueden gestionar shoot_employees"
  on public.shoot_employees
  for all
  to authenticated
  using (true)
  with check (true);

-- Los editores del calendario necesitan leer el catálogo de empleados
create policy "Authenticated pueden leer empleados"
  on public.employees
  for select
  to authenticated
  using (true);
