-- Tabla de control de ingresos / proyectos aprobados
create table if not exists public.ingresos (
  id             uuid primary key default gen_random_uuid(),
  empresa        text not null default 'retro_studio'
                   check (empresa in ('retro_studio', 'retro_films')),
  odc            text,
  estatus        text not null default 'en_produccion'
                   check (estatus in (
                     'en_produccion',
                     'proceso_facturado',
                     'facturado',
                     'por_cobrar',
                     'factorado',
                     'pagado'
                   )),
  cliente_agencia text not null,
  responsable    text,
  proyecto       text not null,
  numero_factura text,
  subtotal       numeric not null default 0,
  iva            numeric not null default 0,
  fecha_aprox_pago text,
  fecha_pago     text,
  mes_cierre     text,
  notas          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.ingresos enable row level security;

create policy "Solo admins pueden ver ingresos"
  on public.ingresos for select to authenticated
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

create policy "Solo admins pueden insertar ingresos"
  on public.ingresos for insert to authenticated
  with check (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

create policy "Solo admins pueden actualizar ingresos"
  on public.ingresos for update to authenticated
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

create policy "Solo admins pueden eliminar ingresos"
  on public.ingresos for delete to authenticated
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));
