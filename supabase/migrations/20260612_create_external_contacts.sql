-- Memoria de emails externos invitados a juntas, para autocompletar en el formulario

create table if not exists public.external_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invite_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.external_contacts enable row level security;

-- Lectura: cualquier usuario autenticado (para sugerencias al escribir).
-- Escritura: solo el servidor (service role) al enviar invitaciones.
create policy "Usuarios autenticados pueden leer contactos externos"
  on public.external_contacts
  for select
  to authenticated
  using (true);
