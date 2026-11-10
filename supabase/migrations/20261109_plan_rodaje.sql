-- Plan de rodaje por proyecto.
--
-- Cada proyecto puede tener UN plan (rodaje_planes). Al plan se le suben
-- guiones (rodaje_archivos, en el bucket privado "guiones"); la IA los lee y
-- los separa en guiones/videos/capítulos (rodaje_guiones) y escenas
-- (rodaje_escenas). El plan de trabajo se arma repartiendo las escenas en días
-- (rodaje_dias), con separadores con título entre escenas (rodaje_separadores).
-- La calificación de tomas (rodaje_tomas) queda creada para la siguiente etapa.
--
-- Permisos: cualquier usuario con sesión puede VER; solo Admin, Editor Post
-- (rol "productor") y Editor Premium pueden EDITAR. Para cambiar quién edita
-- basta redefinir la función rodaje_puede_editar().
--
-- Ejecuta este script en el SQL Editor de Supabase antes de usar el módulo.

-- ── Quién edita ───────────────────────────────────────────────────────────────
create or replace function public.rodaje_puede_editar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'productor', 'editor_premium')
  );
$$;

grant execute on function public.rodaje_puede_editar() to authenticated;

-- ── Tablas ────────────────────────────────────────────────────────────────────
create table if not exists public.rodaje_planes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null unique references public.projects(id) on delete cascade,
  -- Cómo se le dice a cada pieza del guion en este proyecto
  etiqueta    text not null default 'guion'
              check (etiqueta in ('guion', 'video', 'capitulo', 'episodio')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.rodaje_archivos (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.rodaje_planes(id) on delete cascade,
  nombre      text not null,
  ruta        text not null,            -- ruta dentro del bucket "guiones"
  mime        text not null,
  tamano      bigint,
  -- subido → (la IA lo lee) leido → (el usuario revisa y confirma) aplicado
  estado      text not null default 'subido'
              check (estado in ('subido', 'leido', 'aplicado', 'error')),
  indice      jsonb,                    -- lo que leyó la IA, pendiente de revisar
  error       text,
  uso         jsonb not null default '{}'::jsonb,  -- tokens gastados en la lectura
  subido_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.rodaje_guiones (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.rodaje_planes(id) on delete cascade,
  archivo_id  uuid references public.rodaje_archivos(id) on delete set null,
  orden       int  not null default 0,
  numero      text not null,
  titulo      text not null default '',
  resumen     text not null default '',
  notas       jsonb not null default '[]'::jsonb,   -- pendientes / "ojo"
  unidad      smallint check (unidad in (1, 2)),    -- unidad de rodaje asignada
  created_at  timestamptz not null default now()
);

create table if not exists public.rodaje_dias (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.rodaje_planes(id) on delete cascade,
  fecha       date,
  nota        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.rodaje_escenas (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.rodaje_planes(id) on delete cascade,
  guion_id      uuid not null references public.rodaje_guiones(id) on delete cascade,
  orden         int  not null default 0,          -- orden dentro del guion
  numero        text not null,
  encabezado    text not null default '',         -- como viene en el guion
  ie            text not null default '',         -- INT / EXT / INT/EXT
  locacion      text not null default '',
  momento       text not null default '',         -- DÍA / NOCHE / …
  descripcion   text not null default '',
  personajes    text[] not null default '{}',
  pagina        int,
  texto         jsonb,                            -- null = todavía no se lee
  -- Para saber si ya se leyó sin tener que bajar el texto de todas las escenas
  tiene_texto   boolean generated always as (texto is not null) stored,
  -- Plan de trabajo
  dia_id        uuid references public.rodaje_dias(id) on delete set null,
  pos           int  not null default 0,          -- lugar dentro del día
  filmada       boolean not null default false,
  filmada_at    timestamptz,
  filmada_por   uuid references auth.users(id) on delete set null,
  -- Siguiente etapa: locación original antes de editarla y escenas juntas
  loc_original  jsonb,
  grupo_id      uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.rodaje_separadores (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.rodaje_planes(id) on delete cascade,
  dia_id      uuid not null references public.rodaje_dias(id) on delete cascade,
  titulo      text not null,
  pos         int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.rodaje_tomas (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.rodaje_planes(id) on delete cascade,
  escena_id      uuid not null references public.rodaje_escenas(id) on delete cascade,
  orden          int  not null default 0,
  emplazamiento  text not null default '',
  buena          text not null default '',
  proteccion     text not null default '',
  notas          text not null default '',
  updated_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now()
);

create index if not exists rodaje_archivos_plan_idx     on public.rodaje_archivos (plan_id);
create index if not exists rodaje_guiones_plan_idx      on public.rodaje_guiones (plan_id, orden);
create index if not exists rodaje_dias_plan_idx         on public.rodaje_dias (plan_id);
create index if not exists rodaje_escenas_plan_idx      on public.rodaje_escenas (plan_id);
create index if not exists rodaje_escenas_guion_idx     on public.rodaje_escenas (guion_id, orden);
create index if not exists rodaje_escenas_dia_idx       on public.rodaje_escenas (dia_id, pos);
create index if not exists rodaje_separadores_plan_idx  on public.rodaje_separadores (plan_id);
create index if not exists rodaje_tomas_escena_idx      on public.rodaje_tomas (escena_id, orden);

-- ── Seguridad por fila ────────────────────────────────────────────────────────
do $$
declare
  t text;
  tablas text[] := array[
    'rodaje_planes', 'rodaje_archivos', 'rodaje_guiones', 'rodaje_dias',
    'rodaje_escenas', 'rodaje_separadores', 'rodaje_tomas'
  ];
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

-- ── Reordenar el plan en una sola operación ───────────────────────────────────
-- p_items: [{"t":"e"|"s","id":"<uuid>","dia":"<uuid>"|null,"pos":<int>}, …]
--   t = "e" escena · "s" separador. Solo se mandan los renglones que cambiaron.
-- Corre con los permisos de quien llama, así que las políticas de arriba aplican.
create or replace function public.rodaje_guardar_orden(p_plan uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.rodaje_puede_editar() then
    raise exception 'No tienes permiso para mover el plan de rodaje';
  end if;

  update public.rodaje_escenas e
     set dia_id     = nullif(i->>'dia', '')::uuid,
         pos        = (i->>'pos')::int,
         updated_at = now()
    from jsonb_array_elements(p_items) i
   where i->>'t' = 'e'
     and e.id = (i->>'id')::uuid
     and e.plan_id = p_plan;

  update public.rodaje_separadores s
     set dia_id = (i->>'dia')::uuid,
         pos    = (i->>'pos')::int
    from jsonb_array_elements(p_items) i
   where i->>'t' = 's'
     and s.id = (i->>'id')::uuid
     and s.plan_id = p_plan
     and nullif(i->>'dia', '') is not null;
end;
$$;

grant execute on function public.rodaje_guardar_orden(uuid, jsonb) to authenticated;

-- ── Consumo de IA por archivo ─────────────────────────────────────────────────
-- Suma los tokens de cada lectura sin pisarse cuando varias corren a la vez.
-- Solo la llama el servidor (/api/rodaje/leer) con la llave de servicio.
create or replace function public.rodaje_sumar_uso(p_archivo uuid, p_uso jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.rodaje_archivos a
     set uso = jsonb_build_object(
           'entrada',         coalesce((a.uso->>'entrada')::bigint, 0)         + coalesce((p_uso->>'entrada')::bigint, 0),
           'salida',          coalesce((a.uso->>'salida')::bigint, 0)          + coalesce((p_uso->>'salida')::bigint, 0),
           'cache_lectura',   coalesce((a.uso->>'cache_lectura')::bigint, 0)   + coalesce((p_uso->>'cache_lectura')::bigint, 0),
           'cache_escritura', coalesce((a.uso->>'cache_escritura')::bigint, 0) + coalesce((p_uso->>'cache_escritura')::bigint, 0),
           'modelo',          coalesce(p_uso->>'modelo', a.uso->>'modelo')
         )
   where a.id = p_archivo;
$$;

revoke execute on function public.rodaje_sumar_uso(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rodaje_sumar_uso(uuid, jsonb) to service_role;

-- ── Archivos de guiones ───────────────────────────────────────────────────────
-- Bucket privado. No lleva políticas: se sube con URL firmada que da la API
-- (/api/rodaje/archivos) y solo el servidor lo descarga para mandarlo a la IA.
insert into storage.buckets (id, name, public)
values ('guiones', 'guiones', false)
on conflict (id) do nothing;

-- ── Tiempo real ───────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tablas text[] := array[
    'rodaje_planes', 'rodaje_archivos', 'rodaje_guiones', 'rodaje_dias',
    'rodaje_escenas', 'rodaje_separadores', 'rodaje_tomas'
  ];
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
