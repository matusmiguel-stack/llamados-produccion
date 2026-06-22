-- Blindar sueldos a nivel base de datos: se mueven a una tabla aparte que
-- SOLO el admin puede leer/escribir. La tabla employees queda sin sueldo,
-- así que aunque su lectura esté abierta, nadie más ve sueldos.

create table if not exists public.employee_compensation (
  employee_id    uuid primary key references public.employees(id) on delete cascade,
  sueldo_mensual numeric not null default 0,
  updated_at     timestamptz not null default now()
);

-- Migrar los sueldos existentes
insert into public.employee_compensation (employee_id, sueldo_mensual)
  select id, sueldo_mensual from public.employees
  on conflict (employee_id) do nothing;

alter table public.employee_compensation enable row level security;

drop policy if exists "Solo admin gestiona compensacion" on public.employee_compensation;
create policy "Solo admin gestiona compensacion"
  on public.employee_compensation
  for all
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- Quitar el sueldo de la tabla employees (ya está en employee_compensation)
alter table public.employees drop column if exists sueldo_mensual;
