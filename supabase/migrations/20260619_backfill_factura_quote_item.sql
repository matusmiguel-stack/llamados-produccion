-- Backfill: vincular facturas de proveedor ya existentes con su egreso (quote_item)
-- por proyecto + proveedor + monto. Solo facturas de proveedor sin vínculo previo,
-- y solo egresos del flujo de proveedor (sin modo anticipo/comprobación).

update public.facturas f
set quote_item_id = qi.id
from public.quote_items qi
join public.quote_sections qs on qs.id = qi.section_id
join public.quotes q          on q.id  = qs.quote_id
where f.quote_item_id is null
  and (f.origen is null or f.origen = 'proveedor')
  and f.project_id = q.project_id
  and qi.actual_supplier_id = f.proveedor_id
  and qi.pago_modo is null
  and abs(
        coalesce(qi.actual_qty, greatest(qi.qty, 1))
      * coalesce(qi.actual_days, greatest(qi.days, 1))
      * coalesce(qi.actual_unit_price, qi.unit_price)
      - f.subtotal
    ) < 1.5
  -- no vincular un egreso que ya esté tomado por otra factura
  and not exists (
    select 1 from public.facturas f2
    where f2.quote_item_id = qi.id and f2.id <> f.id
  );
