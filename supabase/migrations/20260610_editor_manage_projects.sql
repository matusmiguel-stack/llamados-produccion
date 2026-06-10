-- Permite a admin, editor y editor_premium crear/editar clientes, subcarpetas y proyectos

-- ── clients ──────────────────────────────────────────────────────────────────
drop policy if exists "Admins pueden gestionar clientes" on public.clients;

create policy "Editors pueden gestionar clientes"
  on public.clients
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

-- ── client_subfolders ─────────────────────────────────────────────────────────
drop policy if exists "Admins pueden gestionar subcarpetas" on public.client_subfolders;

create policy "Editors pueden gestionar subcarpetas"
  on public.client_subfolders
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

-- ── projects ──────────────────────────────────────────────────────────────────
drop policy if exists "Admins pueden gestionar proyectos" on public.projects;

create policy "Editors pueden gestionar proyectos"
  on public.projects
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
