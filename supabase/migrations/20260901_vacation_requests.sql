-- ════════════════════════════════════════════════════════════════════════════
-- Solicitudes de vacaciones
-- Cualquier usuario puede pedir días; solo los aprobadores (Adriana y Miguel)
-- los aceptan o declinan. Al aprobar se crean los bloques en el calendario.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.vacation_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id    uuid not null references auth.users(id) on delete cascade,
  requester_name  text not null,
  requester_email text not null,
  -- empleado vinculado por email (de ahí salen los días que le corresponden)
  employee_id     uuid references public.employees(id) on delete set null,
  -- días solicitados como fechas sueltas; los corridos se guardan igual
  dias            date[] not null,
  dias_habiles    numeric not null default 0,
  nota            text,
  status          text not null default 'pendiente'
                    check (status in ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo  text,
  decided_by      uuid references auth.users(id) on delete set null,
  decided_by_name text,
  decided_at      timestamptz,
  -- vacations creadas al aprobar (para poder revertirlas si se borra)
  vacation_ids    uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index if not exists vacation_requests_status_idx    on public.vacation_requests (status, created_at desc);
create index if not exists vacation_requests_requester_idx on public.vacation_requests (requester_id, created_at desc);

alter table public.vacation_requests enable row level security;

-- Lectura: cada quien ve las suyas; los aprobadores ven todas.
drop policy if exists "Ver solicitudes propias o todas si aprueba" on public.vacation_requests;
create policy "Ver solicitudes propias o todas si aprueba"
  on public.vacation_requests
  for select
  to authenticated
  using (
    requester_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and lower(profiles.email) in (
          'adriana@retrocasaproductora.com',
          'miguel@retrocasaproductora.com',
          'matusmiguel@gmail.com'
        )
    )
  );

-- Escritura: nadie directo. Alta y resolución pasan por las API routes
-- (service role), que validan saldo de días, traslapes y permisos.

-- Realtime para que el badge de pendientes y los listados se actualicen solos
do $$
begin
  alter publication supabase_realtime add table public.vacation_requests;
exception when duplicate_object then null;
end $$;
