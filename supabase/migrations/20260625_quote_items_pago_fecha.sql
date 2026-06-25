-- Fecha real en que se realizó el pago de un anticipo/comprobación.
-- El pago a veces se hace días antes de marcarlo como pagado en el sistema;
-- finanzas necesita saber el día real, no la fecha en que se registró.
alter table public.quote_items add column if not exists pago_fecha date;
