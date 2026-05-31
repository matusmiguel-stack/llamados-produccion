-- ── Códigos de proyecto (RS3000, RS3001, RS3002…) ─────────────────────────────

-- 1. Agregar columna code
alter table public.projects
  add column if not exists code text;

-- 2. Función que calcula el siguiente código disponible
create or replace function public.next_project_code()
returns text
language plpgsql
as $$
declare
  next_num integer;
begin
  select coalesce(
    max(cast(substring(code from 3) as integer)),
    2999          -- si no hay ninguno aún, el siguiente será 3000
  ) + 1
  into next_num
  from public.projects
  where code ~ '^RS[0-9]+$';

  return 'RS' || next_num;
end;
$$;

-- 3. Trigger que asigna el código automáticamente al crear un proyecto
create or replace function public.auto_assign_project_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null then
    new.code := public.next_project_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_project_code on public.projects;
create trigger trg_project_code
  before insert on public.projects
  for each row execute function public.auto_assign_project_code();

-- 4. Asignar RS3000 al proyecto "Kueski Junio" (si existe)
update public.projects
set code = 'RS3000'
where name ilike '%Kueski%Junio%'
  and (code is null or code = '');
