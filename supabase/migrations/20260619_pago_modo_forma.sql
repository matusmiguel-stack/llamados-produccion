-- Modo de pago elegido desde la liberación + forma/cuenta de donde salió el pago
alter table public.quote_items
  add column if not exists pago_modo text;     -- 'anticipo' | 'comprobacion' | null

alter table public.facturas
  add column if not exists forma_pago text;     -- Retro Studio | Retro Films | Konfio | Banregio | Efectivo
