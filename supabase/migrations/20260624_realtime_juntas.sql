-- Agrega juntas y junta_attendees a la publicación de Realtime.
-- El calendario (app/page.tsx) ya se suscribía a estas tablas vía postgres_changes,
-- pero como NO estaban en la publicación, la suscripción del canal entero fallaba
-- (CHANNEL_ERROR) y se rompía el realtime de TODO el calendario, incluidos los
-- llamados (shoots). Sin esto había que refrescar el navegador para ver cambios.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'juntas'
  ) then
    alter publication supabase_realtime add table public.juntas;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'junta_attendees'
  ) then
    alter publication supabase_realtime add table public.junta_attendees;
  end if;
end $$;
