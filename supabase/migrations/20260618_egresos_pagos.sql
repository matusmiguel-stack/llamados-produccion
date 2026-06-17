-- Pagos de egresos (anticipo / comprobación) reflejados en Finanzas
-- Ejecutar en el SQL Editor de Supabase

-- facturas: concepto del gasto, origen del registro y email opcional
alter table public.facturas
  add column if not exists concepto text,
  add column if not exists origen text not null default 'proveedor';
alter table public.facturas alter column proveedor_email drop not null;

-- origen acepta: proveedor (default), anticipo, comprobacion
-- status ya acepta: aceptada, rechazada, pagada

-- quote_items: estado de pago del egreso
alter table public.quote_items
  add column if not exists pago_tipo text,        -- 'anticipo' | 'comprobacion'
  add column if not exists pago_estado text,       -- 'pagado' | 'pendiente_cierre'
  add column if not exists monto_comprobado numeric,
  add column if not exists factura_id uuid references public.facturas(id) on delete set null;
