-- Ejecuta esto si ya creaste la tabla employees sin cumpleaños

alter table public.employees
  add column if not exists cumpleanos date;
