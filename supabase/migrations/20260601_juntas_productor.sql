-- Ampliar permisos de juntas y junta_attendees para incluir el rol 'productor'

drop policy if exists "Admins y editors gestionan juntas"      on public.juntas;
drop policy if exists "Admins y editors gestionan asistentes"  on public.junta_attendees;

create policy "Gestionan juntas"
  on public.juntas for all to authenticated
  using (
    exists (select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.role in ('admin','editor','productor'))
  )
  with check (
    exists (select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.role in ('admin','editor','productor'))
  );

create policy "Gestionan asistentes"
  on public.junta_attendees for all to authenticated
  using (
    exists (select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.role in ('admin','editor','productor'))
  )
  with check (
    exists (select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.role in ('admin','editor','productor'))
  );
