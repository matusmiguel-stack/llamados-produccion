-- ════════════════════════════════════════════════════════════════════════════
-- RLS catch-up: editor_premium en todas las tablas + arreglos de consistencia
-- Ejecutar completo en el SQL Editor de Supabase
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: roles de staff con permisos de edición general
-- (admin, editor, editor_premium)

-- ─── quotes ──────────────────────────────────────────────────────────────────
drop policy if exists "Editores pueden gestionar cotizaciones" on public.quotes;
create policy "Editores pueden gestionar cotizaciones"
  on public.quotes for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('editor','editor_premium')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('editor','editor_premium')));

-- ─── quote_sections ──────────────────────────────────────────────────────────
drop policy if exists "Editores pueden gestionar secciones de cotización" on public.quote_sections;
create policy "Editores pueden gestionar secciones de cotización"
  on public.quote_sections for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('editor','editor_premium')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('editor','editor_premium')));

-- ─── quote_items ─────────────────────────────────────────────────────────────
drop policy if exists "Editores pueden gestionar items de cotización" on public.quote_items;
create policy "Editores pueden gestionar items de cotización"
  on public.quote_items for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('editor','editor_premium')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('editor','editor_premium')));

-- ─── juntas ──────────────────────────────────────────────────────────────────
drop policy if exists "Admins, editors y productores gestionan juntas" on public.juntas;
drop policy if exists "Staff gestiona juntas" on public.juntas;
create policy "Staff gestiona juntas"
  on public.juntas for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium','productor')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium','productor')));

drop policy if exists "Admins, editors y productores gestionan asistentes" on public.junta_attendees;
drop policy if exists "Staff gestiona junta_attendees" on public.junta_attendees;
create policy "Staff gestiona junta_attendees"
  on public.junta_attendees for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium','productor')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium','productor')));

-- ─── entregas (post producción) ──────────────────────────────────────────────
drop policy if exists "Admins, editors y productores gestionan entregas" on public.entregas;
create policy "Admins, editors y productores gestionan entregas"
  on public.entregas for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium','productor')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium','productor')));

-- ─── hoja_llamado: editores también pueden guardar ───────────────────────────
drop policy if exists "Admins pueden gestionar hoja de llamado" on public.hoja_llamado;
create policy "Staff gestiona hoja de llamado"
  on public.hoja_llamado for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor','editor_premium')));

-- ─── vacations: cerrar el hueco (era using(true) para cualquier usuario) ─────
drop policy if exists "Authenticated pueden gestionar vacations" on public.vacations;
create policy "Admin y editor premium gestionan vacations"
  on public.vacations for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor_premium')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor_premium')));

drop policy if exists "Authenticated pueden gestionar vacation_employees" on public.vacation_employees;
create policy "Admin y editor premium gestionan vacation_employees"
  on public.vacation_employees for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor_premium')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin','editor_premium')));

-- ─── facturas: nuevas columnas para validación y pago ────────────────────────
alter table public.facturas
  add column if not exists uuid_fiscal text,
  add column if not exists paid_at timestamptz;

-- UUID fiscal único (solo cuando no es null)
create unique index if not exists facturas_uuid_fiscal_unique
  on public.facturas (uuid_fiscal) where uuid_fiscal is not null;

-- status ahora acepta 'pagada'
alter table public.facturas drop constraint if exists facturas_status_check;
alter table public.facturas add constraint facturas_status_check
  check (status in ('aceptada', 'rechazada', 'pagada'));

-- ─── projects: empresa directa en el proyecto ────────────────────────────────
alter table public.projects
  add column if not exists empresa text
  check (empresa is null or empresa in ('retro_studio', 'retro_films'));

-- Backfill desde ingresos existentes
update public.projects p
set empresa = i.empresa
from public.ingresos i
where i.project_id = p.id
  and p.empresa is null
  and i.empresa is not null;
