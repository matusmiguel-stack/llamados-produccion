-- Disparador del recordatorio de 10 minutos (juntas y llamados).
--
-- Contexto: Vercel está en plan Hobby, que solo permite crons DIARIOS, así que
-- no se puede usar `vercel.json` para correr cada 5 minutos (declararlo ahí
-- rompería el deploy). En su lugar el disparador vive en Supabase con pg_cron
-- + pg_net, que ya es infraestructura propia y no cuesta extra.
--
-- El endpoint (/api/cron/event-reminder) es idempotente: usa notification_log
-- (unique type+ref_id+user_id) para no repetir avisos, y una ventana de
-- recuperación de 14 min para que un tick perdido no cancele el aviso.
--
-- Aplicada el 2026-08-03 vía Management API.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- El bearer token vive en Vault, no en texto plano dentro del job.
-- (creado con: select vault.create_secret('<token>', 'cron_secret_event_reminder', '...'))
-- Debe coincidir con la variable CRON_SECRET del proyecto en Vercel.

select cron.schedule(
  'event-reminder-10min',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://app.retrocasaproductora.com/api/cron/event-reminder',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_event_reminder')
    ),
    timeout_milliseconds := 25000
  );
  $$
);

-- Diagnóstico útil:
--   select * from cron.job where jobname = 'event-reminder-10min';
--   select * from cron.job_run_details where jobid = 1 order by start_time desc limit 10;
--   select status_code, content from net._http_response order by id desc limit 5;
-- Si se rota CRON_SECRET en Vercel, actualizar también el secreto en Vault.
