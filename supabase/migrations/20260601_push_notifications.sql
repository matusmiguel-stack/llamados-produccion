-- ── Push subscriptions ───────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  endpoint    text        not null,
  p256dh      text        not null,
  auth        text        not null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "Usuarios ven sus propias suscripciones"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy "Usuarios gestionan sus suscripciones"
  on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Notification log (evita duplicados) ──────────────────────────────────────
create table if not exists public.notification_log (
  id        uuid        primary key default gen_random_uuid(),
  type      text        not null,
  ref_id    text        not null,
  user_id   uuid        not null references auth.users(id) on delete cascade,
  sent_at   timestamptz not null default now(),
  unique (type, ref_id, user_id)
);

alter table public.notification_log enable row level security;

create policy "Solo el sistema puede gestionar el log"
  on public.notification_log for all to authenticated
  using (false);
