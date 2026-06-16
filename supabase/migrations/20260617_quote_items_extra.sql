-- Gastos no contemplados (extra) en la liberación de presupuesto.
-- Son quote_items con cotizado = 0 que van directo a pérdida.
alter table public.quote_items
  add column if not exists is_extra boolean not null default false;
