-- Sistema de recepción de facturas de proveedores
-- Ejecutar en el SQL Editor de Supabase

create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  proveedor_email text not null,
  codigo_proyecto text,
  subtotal numeric,
  status text not null check (status in ('aceptada', 'rechazada')),
  motivo_rechazo text,
  fecha_pago date,
  xml_path text,
  pdf_path text,
  created_at timestamptz not null default now()
);

alter table public.facturas enable row level security;

-- Solo usuarios autenticados con rol pueden leer (el insert lo hace el service role desde la API)
create policy "Editors pueden leer facturas"
  on public.facturas
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor', 'editor_premium')
    )
  );

-- Bucket de storage para los archivos de facturas
insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict (id) do nothing;
