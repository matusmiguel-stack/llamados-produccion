-- Permite a editores crear y modificar clientes, proyectos, subcarpetas y cotizaciones
-- Los admins ya tienen sus propias políticas; estas cubren el rol 'editor'

-- ─── clients ───────────────────────────────────────────────────────────────
create policy "Editores pueden gestionar clientes"
  on public.clients
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  );

-- ─── projects ──────────────────────────────────────────────────────────────
create policy "Editores pueden gestionar proyectos"
  on public.projects
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  );

-- ─── client_subfolders ─────────────────────────────────────────────────────
create policy "Editores pueden gestionar subcarpetas"
  on public.client_subfolders
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  );

-- ─── quotes ────────────────────────────────────────────────────────────────
create policy "Editores pueden gestionar cotizaciones"
  on public.quotes
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  );

-- ─── quote_sections ────────────────────────────────────────────────────────
create policy "Editores pueden gestionar secciones de cotización"
  on public.quote_sections
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  );

-- ─── quote_items ───────────────────────────────────────────────────────────
create policy "Editores pueden gestionar items de cotización"
  on public.quote_items
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  );
