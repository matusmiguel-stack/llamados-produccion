-- Hoja de llamado por proyecto
create table if not exists public.hoja_llamado (
  id                uuid        primary key default gen_random_uuid(),
  project_id        uuid        not null references public.projects(id) on delete cascade,
  -- Header
  fecha_rodaje      text,
  titulo            text,
  dia_num           int         not null default 1,
  dia_total         int         not null default 1,
  avanzada          text,
  client_on_loc     text,
  director          text,
  productor         text,
  ready_to_shoot    text,
  locacion_nombre   text,
  locacion_url      text,
  -- Clima
  amanecer          text,
  atardecer         text,
  clima             text,
  lluvia            text,
  -- Tablas (JSONB)
  locaciones        jsonb       not null default '[]'::jsonb,
  cast_list         jsonb       not null default '[]'::jsonb,
  crew              jsonb       not null default '[]'::jsonb,
  -- Necesidades
  arte_needs        text,
  makeup_needs      text,
  vestuario_needs   text,
  efectos_needs     text,
  -- Bottom
  vehiculos         text,
  equipo_especial   text,
  notas_produccion  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists hoja_llamado_project_id_idx on public.hoja_llamado (project_id);

alter table public.hoja_llamado enable row level security;

create policy "Authenticated pueden ver hoja de llamado"
  on public.hoja_llamado for select to authenticated using (true);

create policy "Admins pueden gestionar hoja de llamado"
  on public.hoja_llamado for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));
