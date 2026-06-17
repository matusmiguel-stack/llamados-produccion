-- Marca desde la liberación qué rubros se pagan por anticipo/comprobación.
-- Solo esos habilitan los botones de pago en el control de egresos.
alter table public.quote_items
  add column if not exists requiere_anticipo boolean not null default false;
