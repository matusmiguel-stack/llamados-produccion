-- Historial de movimientos (audit log) — solo admin.
-- Captura altas/cambios/bajas de las tablas de negocio mediante triggers.
-- El actor se toma de auth.uid() (disponible en las operaciones que hace el
-- usuario directo contra Supabase); como respaldo se puede fijar app.actor_id
-- desde una API route con service role.

create table if not exists public.activity_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  actor_name   text,
  action       text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name   text not null,
  record_id    text,
  summary      text,
  old_data     jsonb,
  new_data     jsonb
);

create index if not exists activity_log_occurred_idx on public.activity_log (occurred_at desc);
create index if not exists activity_log_table_idx    on public.activity_log (table_name);
create index if not exists activity_log_actor_idx    on public.activity_log (actor_id);

alter table public.activity_log enable row level security;

drop policy if exists activity_log_admin_select on public.activity_log;
create policy activity_log_admin_select on public.activity_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Función genérica de logging
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  v_email text;
  v_name  text;
  v_new   jsonb;
  v_old   jsonb;
  v_row   jsonb;
  v_rec   text;
  v_sum   text;
begin
  if v_actor is not null then
    select email, full_name into v_email, v_name
    from public.profiles where id = v_actor;
  end if;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(OLD);
  elsif tg_op = 'UPDATE' then
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
  else
    v_new := to_jsonb(NEW);
  end if;

  v_row := coalesce(v_new, v_old);
  v_rec := v_row->>'id';
  -- Etiqueta legible: primera columna "nombre-like" que exista en la fila
  v_sum := coalesce(
    v_row->>'title', v_row->>'name', v_row->>'nombre', v_row->>'empresa',
    v_row->>'concepto', v_row->>'code', v_row->>'folio', v_row->>'descripcion',
    v_row->>'label', v_row->>'client', v_row->>'email', v_row->>'proveedor_email'
  );

  insert into public.activity_log
    (actor_id, actor_email, actor_name, action, table_name, record_id, summary, old_data, new_data)
  values
    (v_actor, v_email, v_name, tg_op, tg_table_name, v_rec, v_sum, v_old, v_new);

  if tg_op = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

-- Adjuntar el trigger a las tablas de negocio relevantes (si existen)
do $$
declare
  t text;
  tables text[] := array[
    'shoots','juntas','ensayos','vacations','projects','clients','quotes',
    'quote_sections','quote_items','ingresos','facturas','proveedores',
    'employees','resources','referencias','user_tasks','flujo_movimientos',
    'flujo_fijos','entregas','external_contacts','hoja_llamado','client_subfolders'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('drop trigger if exists zz_activity_log on public.%I', t);
      execute format(
        'create trigger zz_activity_log after insert or update or delete on public.%I for each row execute function public.log_activity()',
        t
      );
    end if;
  end loop;
end $$;
