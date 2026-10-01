-- Disparador diario del recálculo automático de vacaciones por antigüedad.
--
-- Contexto: antes "años laborados" y "mes de reseteo" se capturaban a mano en
-- /empleados — se recalculó una sola vez para todos a partir de fecha_ingreso
-- (sin tocar vac_dias_base, es decir sin modificar los días ya tomados) y de
-- ahora en adelante /api/cron/vacaciones-aniversario mantiene vac_anios y
-- vac_mes_reseteo sincronizados con fecha_ingreso cada día, aplicando el
-- reinicio (días tomados en 0, años +1) solo cuando el empleado cruza su
-- aniversario real.
--
-- Igual que event-reminder: Vercel Hobby solo permite 2 crons (ya usados por
-- daily-digest y tasks-reminder), así que este también vive en pg_cron.
--
-- Aplicada el 2026-10-01 vía Management API.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reutiliza el mismo secreto (= CRON_SECRET en Vercel) que ya usa event-reminder.

select cron.schedule(
  'vacaciones-aniversario-daily',
  '0 13 * * *',
  $$
  select net.http_get(
    url := 'https://app.retrocasaproductora.com/api/cron/vacaciones-aniversario',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_event_reminder')
    ),
    timeout_milliseconds := 25000
  );
  $$
);

-- Diagnóstico útil:
--   select * from cron.job where jobname = 'vacaciones-aniversario-daily';
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname='vacaciones-aniversario-daily') order by start_time desc limit 10;
