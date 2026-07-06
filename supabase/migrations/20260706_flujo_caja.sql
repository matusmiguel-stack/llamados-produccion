-- Módulo Flujo de Caja: saldo por empresa, gastos fijos recurrentes y movimientos manuales.

create table if not exists flujo_config (
  id uuid primary key default gen_random_uuid(),
  empresa text not null unique,
  saldo_inicial numeric not null default 0,
  fecha_corte date not null default current_date,
  saldo_minimo numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists flujo_fijos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'retro_studio',
  concepto text not null,
  monto numeric not null default 0,
  tipo text not null default 'egreso',          -- egreso | ingreso
  recurrencia text not null default 'mensual',  -- mensual | quincenal | semanal
  dia int,                                      -- mensual: día del mes · semanal: 1=Lun…7=Dom · quincenal: ignora (15 y 30)
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists flujo_movimientos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'retro_studio',
  fecha date not null,
  concepto text not null,
  monto numeric not null default 0,
  tipo text not null default 'egreso',          -- egreso | ingreso
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table flujo_config enable row level security;
alter table flujo_fijos enable row level security;
alter table flujo_movimientos enable row level security;

drop policy if exists "Admin y finanzas gestionan flujo_config" on flujo_config;
create policy "Admin y finanzas gestionan flujo_config" on flujo_config for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','finanzas')))
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('admin','finanzas')));

drop policy if exists "Admin y finanzas gestionan flujo_fijos" on flujo_fijos;
create policy "Admin y finanzas gestionan flujo_fijos" on flujo_fijos for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','finanzas')))
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('admin','finanzas')));

drop policy if exists "Admin y finanzas gestionan flujo_movimientos" on flujo_movimientos;
create policy "Admin y finanzas gestionan flujo_movimientos" on flujo_movimientos for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','finanzas')))
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('admin','finanzas')));

insert into flujo_config (empresa) values ('retro_studio'), ('retro_films')
  on conflict (empresa) do nothing;
