-- Vincula la factura del proveedor directamente con el egreso (quote_item) que cubre
alter table public.facturas
  add column if not exists quote_item_id uuid references public.quote_items(id) on delete set null;
