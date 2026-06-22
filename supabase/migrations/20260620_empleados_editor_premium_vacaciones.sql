-- Editor premium puede gestionar empleados (en la app solo edita vacaciones).
-- La lectura ya está permitida a todos los autenticados.
drop policy if exists "Editor premium gestiona empleados" on public.employees;
create policy "Editor premium gestiona empleados"
  on public.employees
  for update
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'editor_premium'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'editor_premium'));
