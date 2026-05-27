-- Solo admins pueden crear, editar o borrar vacaciones.
-- Todos los usuarios autenticados siguen pudiendo leerlas.

drop policy if exists "Authenticated pueden gestionar vacations" on public.vacations;
drop policy if exists "Authenticated pueden gestionar vacation_employees" on public.vacation_employees;

create policy "Admins pueden gestionar vacations"
  on public.vacations
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins pueden gestionar vacation_employees"
  on public.vacation_employees
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
