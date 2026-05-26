-- Ejecuta este script en el SQL Editor de Supabase antes de usar vacaciones

create table if not exists public.vacations (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now()
);

create table if not exists public.vacation_employees (
  id uuid primary key default gen_random_uuid(),
  vacation_id uuid not null references public.vacations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (vacation_id, employee_id)
);

alter table public.vacations enable row level security;
alter table public.vacation_employees enable row level security;

create policy "Authenticated pueden leer vacations"
  on public.vacations
  for select
  to authenticated
  using (true);

create policy "Authenticated pueden gestionar vacations"
  on public.vacations
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated pueden leer vacation_employees"
  on public.vacation_employees
  for select
  to authenticated
  using (true);

create policy "Authenticated pueden gestionar vacation_employees"
  on public.vacation_employees
  for all
  to authenticated
  using (true)
  with check (true);
