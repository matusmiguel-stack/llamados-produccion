-- Ejecuta esto si ya creaste la tabla employees sin el campo email

alter table public.employees
  add column if not exists email text;

update public.employees
set email = ''
where email is null;

alter table public.employees
  alter column email set not null;
