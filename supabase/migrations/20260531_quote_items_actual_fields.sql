-- Agrega los campos de gastos reales por ítem (si no existen)
alter table public.quote_items
  add column if not exists actual_qty          numeric,
  add column if not exists actual_days         numeric,
  add column if not exists actual_unit_price   numeric,
  add column if not exists actual_supplier_id  uuid references public.proveedores(id) on delete set null;
