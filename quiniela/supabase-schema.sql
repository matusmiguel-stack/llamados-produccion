-- Quiniela Mundial 2026 — Schema

create table grupos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  pts_exacto int not null default 3,
  pts_ganador int not null default 1,
  created_at timestamptz default now()
);

create table jugadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  grupo_id uuid references grupos(id) on delete cascade,
  created_at timestamptz default now(),
  unique(nombre, grupo_id)
);

create table partidos (
  id uuid primary key default gen_random_uuid(),
  api_id int unique not null,
  fase text not null,
  fecha timestamptz not null,
  equipo_local text not null,
  bandera_local text default '',
  equipo_visitante text not null,
  bandera_visitante text default '',
  goles_local int,
  goles_visitante int,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'finalizado')),
  created_at timestamptz default now()
);

create table predicciones (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid references jugadores(id) on delete cascade,
  partido_id uuid references partidos(id) on delete cascade,
  goles_local int not null,
  goles_visitante int not null,
  puntos int,
  created_at timestamptz default now(),
  unique(jugador_id, partido_id)
);

-- Índices
create index on predicciones(jugador_id);
create index on predicciones(partido_id);
create index on jugadores(grupo_id);
create index on partidos(estado);
create index on partidos(fecha);

-- RLS: todos los datos son públicos dentro de la app (la API usa service role)
alter table grupos enable row level security;
alter table jugadores enable row level security;
alter table partidos enable row level security;
alter table predicciones enable row level security;

-- Permitir lectura pública (la lógica de autorización la maneja la API)
create policy "allow all" on grupos for all using (true) with check (true);
create policy "allow all" on jugadores for all using (true) with check (true);
create policy "allow all" on partidos for all using (true) with check (true);
create policy "allow all" on predicciones for all using (true) with check (true);
