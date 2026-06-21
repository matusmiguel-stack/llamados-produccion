-- Control de vacaciones por empleado
-- anios: años laborados (la escala define los días correspondientes)
-- vac_mes_reseteo: mes (1-12) en que se reinician sus vacaciones
-- vac_dias_base: días ya tomados en el período actual fuera del sistema (semilla)
-- vac_ultimo_reset_anio: último año en que se aplicó el reinicio automático

alter table public.employees
  add column if not exists vac_anios            int,
  add column if not exists vac_mes_reseteo      smallint,
  add column if not exists vac_dias_base        numeric not null default 0,
  add column if not exists vac_ultimo_reset_anio int;
