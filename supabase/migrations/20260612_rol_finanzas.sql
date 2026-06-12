-- Rol finanzas: lectura de facturas para admin y finanzas
-- (la API usa service role, pero mantenemos la política consistente)

drop policy if exists "Editors pueden leer facturas" on public.facturas;

create policy "Admin y finanzas pueden leer facturas"
  on public.facturas
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'finanzas')
    )
  );
