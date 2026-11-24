-- Plan de rodaje: unidades (video, segunda unidad, foto…), cada una con su
-- propio plan de trabajo.
--
-- Antes, el día, el orden y el "filmada" vivían en la escena, así que solo
-- cabía un plan por proyecto. Ahora:
--
--   · rodaje_unidades      las unidades del plan (con nombre y tipo).
--   · rodaje_asignaciones  una escena dentro del plan de una unidad: su día, su
--                          lugar en el día y si ya se hizo. La misma escena
--                          puede estar en varias unidades.
--   · rodaje_dia_notas     la nota de llamado de cada día, por unidad.
--   · separadores y tomas  llevan la unidad a la que pertenecen.
--
-- Los días (fechas) siguen siendo del plan: son los mismos para todas.
--
-- Los planes que ya existen NO se convierten aquí: se convierten solos la
-- primera vez que alguien los abre con la versión nueva de la app (función
-- rodaje_preparar_unidades), para tomar el estado más reciente. Por eso este
-- script se puede correr con la app vieja en uso: solo agrega cosas.
--
-- Ejecuta este script en el SQL Editor de Supabase ANTES de publicar la versión
-- de la app que trae unidades. Se puede correr más de una vez.

-- ── Tablas ────────────────────────────────────────────────────────────────────
create table if not exists public.rodaje_unidades (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.rodaje_planes(id) on delete cascade,
  nombre      text not null,
  tipo        text not null default 'video' check (tipo in ('video', 'foto')),
  orden       int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.rodaje_asignaciones (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.rodaje_planes(id) on delete cascade,
  escena_id    uuid not null references public.rodaje_escenas(id) on delete cascade,
  unidad_id    uuid not null references public.rodaje_unidades(id) on delete cascade,
  dia_id       uuid references public.rodaje_dias(id) on delete set null,
  pos          int  not null default 0,          -- lugar dentro del día
  filmada      boolean not null default false,
  filmada_at   timestamptz,
  filmada_por  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (escena_id, unidad_id)
);

create table if not exists public.rodaje_dia_notas (
  dia_id     uuid not null references public.rodaje_dias(id) on delete cascade,
  unidad_id  uuid not null references public.rodaje_unidades(id) on delete cascade,
  plan_id    uuid not null references public.rodaje_planes(id) on delete cascade,
  nota       text not null default '',
  primary key (dia_id, unidad_id)
);

alter table public.rodaje_separadores
  add column if not exists unidad_id uuid references public.rodaje_unidades(id) on delete cascade;
alter table public.rodaje_tomas
  add column if not exists unidad_id uuid references public.rodaje_unidades(id) on delete cascade;

-- Una pieza puede ser un guion (lo de siempre) o una lista de fotos.
alter table public.rodaje_guiones
  add column if not exists tipo text not null default 'guion';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rodaje_guiones_tipo_check') then
    alter table public.rodaje_guiones
      add constraint rodaje_guiones_tipo_check check (tipo in ('guion', 'fotos'));
  end if;
end $$;

create index if not exists rodaje_unidades_plan_idx        on public.rodaje_unidades (plan_id, orden);
create index if not exists rodaje_asignaciones_plan_idx    on public.rodaje_asignaciones (plan_id);
create index if not exists rodaje_asignaciones_unidad_idx  on public.rodaje_asignaciones (unidad_id, dia_id, pos);
create index if not exists rodaje_dia_notas_plan_idx       on public.rodaje_dia_notas (plan_id);
create index if not exists rodaje_separadores_unidad_idx   on public.rodaje_separadores (unidad_id);
create index if not exists rodaje_tomas_unidad_idx         on public.rodaje_tomas (unidad_id);

-- ── Seguridad por fila (igual que el resto del plan) ──────────────────────────
do $$
declare
  t text;
  tablas text[] := array['rodaje_unidades', 'rodaje_asignaciones', 'rodaje_dia_notas'];
begin
  foreach t in array tablas loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "Sesion puede ver %s" on public.%I', t, t);
    execute format(
      'create policy "Sesion puede ver %s" on public.%I for select to authenticated using (true)',
      t, t
    );

    execute format('drop policy if exists "Editores gestionan %s" on public.%I', t, t);
    execute format(
      'create policy "Editores gestionan %s" on public.%I for all to authenticated '
      'using (public.rodaje_puede_editar()) with check (public.rodaje_puede_editar())',
      t, t
    );
  end loop;
end $$;

-- ── Pestañas que se quedaron abiertas con la versión vieja ────────────────────
-- La versión vieja de la app guarda el día, el orden y el "filmada" en la
-- escena; la nueva ya no lee eso. Para que alguien con una pestaña vieja no
-- trabaje en el aire (marcando cosas que nadie más ve), sus cambios se rechazan
-- con un aviso de que recargue. Solo aplica a planes ya convertidos a
-- unidades: mientras la versión nueva no esté publicada, nada cambia.
create or replace function public.rodaje_plan_convertido(p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.rodaje_unidades u where u.plan_id = p_plan);
$$;

revoke execute on function public.rodaje_plan_convertido(uuid) from public, anon;
grant execute on function public.rodaje_plan_convertido(uuid) to authenticated, service_role;

create or replace function public.rodaje_aviso_recarga()
returns void
language plpgsql
as $$
begin
  raise exception 'La app se actualizó. Recarga la página para seguir trabajando.';
end;
$$;

create or replace function public.rodaje_guardia_escenas()
returns trigger
language plpgsql
as $$
begin
  -- Al borrar un día, la base misma limpia el dia_id viejo de sus escenas: eso
  -- no es una pestaña vieja (llega desde otro trigger) y se deja pasar.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if (new.filmada, new.dia_id, new.pos) is distinct from (old.filmada, old.dia_id, old.pos)
     and public.rodaje_plan_convertido(new.plan_id) then
    perform public.rodaje_aviso_recarga();
  end if;
  return new;
end;
$$;

create or replace function public.rodaje_guardia_dias()
returns trigger
language plpgsql
as $$
begin
  if new.nota is distinct from old.nota and public.rodaje_plan_convertido(new.plan_id) then
    perform public.rodaje_aviso_recarga();
  end if;
  return new;
end;
$$;

create or replace function public.rodaje_guardia_guiones()
returns trigger
language plpgsql
as $$
begin
  if new.unidad is distinct from old.unidad and public.rodaje_plan_convertido(new.plan_id) then
    perform public.rodaje_aviso_recarga();
  end if;
  return new;
end;
$$;

-- Separadores y tomas: la versión nueva siempre dice de qué unidad son.
create or replace function public.rodaje_guardia_sin_unidad()
returns trigger
language plpgsql
as $$
begin
  if new.unidad_id is null and public.rodaje_plan_convertido(new.plan_id) then
    perform public.rodaje_aviso_recarga();
  end if;
  return new;
end;
$$;

create or replace trigger rodaje_escenas_version_vieja
  before update of filmada, dia_id, pos on public.rodaje_escenas
  for each row execute function public.rodaje_guardia_escenas();

create or replace trigger rodaje_dias_version_vieja
  before update of nota on public.rodaje_dias
  for each row execute function public.rodaje_guardia_dias();

create or replace trigger rodaje_guiones_version_vieja
  before update of unidad on public.rodaje_guiones
  for each row execute function public.rodaje_guardia_guiones();

create or replace trigger rodaje_separadores_version_vieja
  before insert on public.rodaje_separadores
  for each row execute function public.rodaje_guardia_sin_unidad();

create or replace trigger rodaje_tomas_version_vieja
  before insert on public.rodaje_tomas
  for each row execute function public.rodaje_guardia_sin_unidad();

-- Al sacar una escena de una unidad se van las tomas que esa unidad le calificó.
create or replace function public.rodaje_limpiar_tomas_de_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.rodaje_tomas t
   where t.escena_id = old.escena_id
     and t.unidad_id = old.unidad_id;
  return old;
end;
$$;

create or replace trigger rodaje_asignaciones_tomas
  after delete on public.rodaje_asignaciones
  for each row execute function public.rodaje_limpiar_tomas_de_asignacion();

-- ── Convertir un plan al esquema de unidades ──────────────────────────────────
-- La app la llama al abrir un plan que todavía no tiene unidades. Crea
-- "Unidad 1" y le pasa el plan tal como estaba (día, orden y filmada de cada
-- escena, separadores, tomas y notas de día). Si el plan usaba U1/U2 por pieza,
-- crea también "Unidad 2" con sus piezas. No hace nada si el plan ya tiene
-- unidades, así que llamarla dos veces no duplica.
create or replace function public.rodaje_preparar_unidades(p_plan uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u1 uuid;
  v_u2 uuid;
begin
  -- Dos personas abriendo el plan al mismo tiempo: la segunda espera y sale.
  perform pg_advisory_xact_lock(hashtextextended('rodaje_unidades:' || p_plan::text, 0));

  if not exists (select 1 from public.rodaje_planes where id = p_plan) then return; end if;
  if exists (select 1 from public.rodaje_unidades where plan_id = p_plan) then return; end if;

  insert into public.rodaje_unidades (plan_id, nombre, orden)
  values (p_plan, 'Unidad 1', 0)
  returning id into v_u1;

  if exists (select 1 from public.rodaje_guiones where plan_id = p_plan and unidad = 2) then
    insert into public.rodaje_unidades (plan_id, nombre, orden)
    values (p_plan, 'Unidad 2', 1)
    returning id into v_u2;
  end if;

  insert into public.rodaje_asignaciones
    (plan_id, escena_id, unidad_id, dia_id, pos, filmada, filmada_at, filmada_por)
  select e.plan_id, e.id,
         case when g.unidad = 2 and v_u2 is not null then v_u2 else v_u1 end,
         e.dia_id, e.pos, e.filmada, e.filmada_at, e.filmada_por
    from public.rodaje_escenas e
    join public.rodaje_guiones g on g.id = e.guion_id
   where e.plan_id = p_plan
  on conflict (escena_id, unidad_id) do nothing;

  update public.rodaje_tomas t
     set unidad_id = case when g.unidad = 2 and v_u2 is not null then v_u2 else v_u1 end
    from public.rodaje_escenas e
    join public.rodaje_guiones g on g.id = e.guion_id
   where t.escena_id = e.id
     and t.plan_id = p_plan
     and t.unidad_id is null;

  -- Los separadores y la nota de cada día eran de todo el plan: se quedan en la
  -- unidad 1, y la unidad 2 recibe copia solo de los días en que trabaja.
  if v_u2 is not null then
    insert into public.rodaje_separadores (plan_id, dia_id, titulo, pos, unidad_id)
    select s.plan_id, s.dia_id, s.titulo, s.pos, v_u2
      from public.rodaje_separadores s
     where s.plan_id = p_plan
       and s.unidad_id is null
       and exists (
         select 1 from public.rodaje_asignaciones a
          where a.unidad_id = v_u2 and a.dia_id = s.dia_id
       );
  end if;
  update public.rodaje_separadores
     set unidad_id = v_u1
   where plan_id = p_plan and unidad_id is null;

  insert into public.rodaje_dia_notas (dia_id, unidad_id, plan_id, nota)
  select d.id, u.id, p_plan, d.nota
    from public.rodaje_dias d
    join public.rodaje_unidades u on u.plan_id = p_plan
   where d.plan_id = p_plan
     and d.nota <> ''
     and (
       u.id = v_u1
       or exists (
         select 1 from public.rodaje_asignaciones a
          where a.unidad_id = u.id and a.dia_id = d.id
       )
     )
  on conflict (dia_id, unidad_id) do nothing;
end;
$$;

revoke execute on function public.rodaje_preparar_unidades(uuid) from public, anon;
grant execute on function public.rodaje_preparar_unidades(uuid) to authenticated, service_role;

-- ── Reordenar el plan de una unidad en una sola operación ─────────────────────
-- p_items: [{"t":"e"|"s","id":"<uuid>","dia":"<uuid>"|null,"pos":<int>}, …]
--   t = "e": id es el de la ESCENA (se mueve su lugar en esta unidad).
--   t = "s": id es el del separador.
create or replace function public.rodaje_guardar_orden_unidad(p_plan uuid, p_unidad uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.rodaje_puede_editar() then
    raise exception 'No tienes permiso para mover el plan de rodaje';
  end if;

  update public.rodaje_asignaciones a
     set dia_id     = nullif(i->>'dia', '')::uuid,
         pos        = (i->>'pos')::int,
         updated_at = now()
    from jsonb_array_elements(p_items) i
   where i->>'t' = 'e'
     and a.escena_id = (i->>'id')::uuid
     and a.unidad_id = p_unidad
     and a.plan_id = p_plan;

  update public.rodaje_separadores s
     set dia_id = (i->>'dia')::uuid,
         pos    = (i->>'pos')::int
    from jsonb_array_elements(p_items) i
   where i->>'t' = 's'
     and s.id = (i->>'id')::uuid
     and s.plan_id = p_plan
     and s.unidad_id = p_unidad
     and nullif(i->>'dia', '') is not null;
end;
$$;

grant execute on function public.rodaje_guardar_orden_unidad(uuid, uuid, jsonb) to authenticated;

-- ── Tiempo real ───────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tablas text[] := array['rodaje_unidades', 'rodaje_asignaciones', 'rodaje_dia_notas'];
begin
  foreach t in array tablas loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Que la API de Supabase vea de inmediato las tablas y funciones nuevas.
notify pgrst, 'reload schema';
