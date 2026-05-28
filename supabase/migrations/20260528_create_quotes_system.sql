-- Extiende clients con info de contacto y auditoría
alter table public.clients
  add column if not exists contact_name  text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists created_by    uuid references auth.users(id);

-- Agrega auditoría a projects
alter table public.projects
  add column if not exists created_by uuid references auth.users(id);

-- ─── quotes ────────────────────────────────────────────────────────────────
create table if not exists public.quotes (
  id                 uuid        primary key default gen_random_uuid(),
  project_id         uuid        not null references public.projects(id) on delete cascade,
  name               text        not null,
  status             text        not null default 'draft'
                                 check (status in ('draft', 'sent', 'approved')),
  markup_percentage  numeric     not null default 0,
  created_by         uuid        references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists quotes_project_id_idx on public.quotes (project_id);

alter table public.quotes enable row level security;

create policy "Authenticated pueden leer cotizaciones"
  on public.quotes
  for select
  to authenticated
  using (true);

create policy "Admins pueden gestionar cotizaciones"
  on public.quotes
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ─── quote_sections ────────────────────────────────────────────────────────
create table if not exists public.quote_sections (
  id          uuid        primary key default gen_random_uuid(),
  quote_id    uuid        not null references public.quotes(id) on delete cascade,
  name        text        not null,
  order_index int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists quote_sections_quote_id_idx on public.quote_sections (quote_id);

alter table public.quote_sections enable row level security;

create policy "Authenticated pueden leer secciones de cotización"
  on public.quote_sections
  for select
  to authenticated
  using (true);

create policy "Admins pueden gestionar secciones de cotización"
  on public.quote_sections
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ─── quote_items ───────────────────────────────────────────────────────────
create table if not exists public.quote_items (
  id               uuid        primary key default gen_random_uuid(),
  section_id       uuid        not null references public.quote_sections(id) on delete cascade,
  description      text        not null,
  qty              numeric     not null default 1,
  days             numeric     not null default 1,
  unit_price       numeric     not null default 0,
  released_expense numeric     not null default 0,
  real_expense     numeric     not null default 0,
  supplier         text,
  order_index      int         not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists quote_items_section_id_idx on public.quote_items (section_id);

alter table public.quote_items enable row level security;

create policy "Authenticated pueden leer items de cotización"
  on public.quote_items
  for select
  to authenticated
  using (true);

create policy "Admins pueden gestionar items de cotización"
  on public.quote_items
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
