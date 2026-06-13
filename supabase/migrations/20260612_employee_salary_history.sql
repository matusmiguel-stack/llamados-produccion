-- Histórico de ajustes de sueldo por empleado.
-- Un ajuste con effective_date futura queda "programado" (applied = false)
-- y se aplica automáticamente cuando llega la fecha (al cargar /empleados).

create table if not exists public.employee_salary_changes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  sueldo_anterior numeric(12, 2),
  sueldo_nuevo numeric(12, 2) not null check (sueldo_nuevo >= 0),
  effective_date date not null,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists employee_salary_changes_employee_idx
  on public.employee_salary_changes (employee_id, effective_date desc);

alter table public.employee_salary_changes enable row level security;

create policy "Admins pueden gestionar historial de sueldos"
  on public.employee_salary_changes
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
