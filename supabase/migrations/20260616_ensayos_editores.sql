-- Permitir a editores (editor y editor_premium) gestionar ensayos, además de admin

drop policy if exists "Solo admin gestiona ensayos" on public.ensayos;

create policy "Staff gestiona ensayos"
  on public.ensayos for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium')));
