-- Editores y admins pueden gestionar el inventario de recursos técnicos.
-- Todos los usuarios autenticados pueden leerlo (calendario, etc.).

alter table public.resources enable row level security;

drop policy if exists "Authenticated pueden leer resources" on public.resources;
drop policy if exists "Authenticated pueden gestionar resources" on public.resources;
drop policy if exists "Admins pueden gestionar resources" on public.resources;
drop policy if exists "Editores y admins pueden gestionar resources" on public.resources;

create policy "Authenticated pueden leer resources"
  on public.resources
  for select
  to authenticated
  using (true);

create policy "Editores y admins pueden gestionar resources"
  on public.resources
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );
