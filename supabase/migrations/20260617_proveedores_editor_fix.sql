-- Arreglar alta de proveedores para editores
-- Ejecutar en el SQL Editor de Supabase

-- 1. email y telefono opcionales (el alta rápida desde cotización los deja vacíos)
alter table public.proveedores alter column email    drop not null;
alter table public.proveedores alter column telefono drop not null;

-- 2. Asegurar que admin, editor y editor_premium puedan gestionar proveedores
drop policy if exists "Admins pueden gestionar proveedores" on public.proveedores;
drop policy if exists "Editors pueden gestionar proveedores" on public.proveedores;

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
