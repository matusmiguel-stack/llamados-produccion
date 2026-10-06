-- Eventos personales en el calendario general: los ve y los gestiona SOLO su dueño.
--
-- Pensado para que Miguel separe lo que hace en la oficina de lo personal sin
-- que nadie más lo vea. La privacidad la garantiza RLS, no la pantalla:
--   * no hay ninguna política de lectura para otros usuarios (ni admins);
--   * solo los correos de lib/eventos-personales.ts pueden usar la función.
-- Los endpoints que usan service role (resumen diario, recordatorios, push) no
-- leen esta tabla, y NO se agrega a la publicación de Realtime a propósito:
-- Realtime no filtra por RLS los DELETE y filtraría el id de la fila a todos
-- los suscritos. El calendario la recarga al abrirse, al volver a la ventana y
-- cada pocos minutos.
--
-- Aplicada el 2026-10-06 vía Management API.

create table if not exists public.personal_events (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  titulo      text,
  fecha       date        not null,
  hora_inicio text,
  hora_fin    text,
  all_day     boolean     not null default false,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists personal_events_owner_fecha_idx on public.personal_events (owner_id, fecha);

alter table public.personal_events enable row level security;

create policy "Dueño gestiona sus eventos personales"
  on public.personal_events for all to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and lower(profiles.email) = 'miguel@retrocasaproductora.com'
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and lower(profiles.email) = 'miguel@retrocasaproductora.com'
    )
  );
