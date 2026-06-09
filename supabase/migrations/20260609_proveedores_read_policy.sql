-- Permite a todos los roles autenticados VER el catálogo de proveedores
-- Solo admin puede crear/editar/borrar (política existente)

create policy "Todos los usuarios autenticados pueden ver proveedores"
  on public.proveedores
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor', 'productor', 'viewer')
    )
  );
