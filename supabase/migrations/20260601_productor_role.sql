-- ── Rol "productor" ────────────────────────────────────────────────────────
-- Acceso: Calendario (abierto a todos) + Proyectos (solo Matriz).
-- project_matrices: productores pueden leer y escribir.

-- Lectura (probablemente ya existe una genérica; esta es específica)
drop policy if exists "Productores pueden leer matrices" on public.project_matrices;
create policy "Productores pueden leer matrices"
  on public.project_matrices
  for select
  to authenticated
  using (true);

-- Escritura: admin, editor y productor
drop policy if exists "Admins y productores pueden gestionar matrices" on public.project_matrices;
create policy "Admins y productores pueden gestionar matrices"
  on public.project_matrices
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor', 'productor')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor', 'productor')
    )
  );
