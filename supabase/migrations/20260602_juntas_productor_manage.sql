-- Permitir que el rol 'productor' también pueda gestionar juntas y asistentes

drop policy if exists "Admins y editors gestionan juntas" on public.juntas;
create policy "Admins, editors y productores gestionan juntas"
  on public.juntas for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','productor')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','productor')));

drop policy if exists "Admins y editors gestionan asistentes" on public.junta_attendees;
create policy "Admins, editors y productores gestionan asistentes"
  on public.junta_attendees for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','productor')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','productor')));
