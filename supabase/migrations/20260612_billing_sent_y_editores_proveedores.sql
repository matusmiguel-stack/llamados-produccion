-- 1. Marca de envío de instrucciones de facturación por ítem de egreso
alter table public.quote_items
  add column if not exists billing_sent_at timestamptz;

-- 2. Permitir a editores gestionar proveedores
drop policy if exists "Admins pueden gestionar proveedores" on public.proveedores;

create policy "Editors pueden gestionar proveedores"
  on public.proveedores
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor', 'editor_premium')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor', 'editor_premium')
    )
  );

-- 3. Incluir editor_premium en la política de lectura del catálogo
drop policy if exists "Todos los usuarios autenticados pueden ver proveedores" on public.proveedores;

create policy "Todos los usuarios autenticados pueden ver proveedores"
  on public.proveedores
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor', 'editor_premium', 'productor', 'viewer')
    )
  );
