-- Extiende facturas_sync_pago_fecha: cuando finanzas marca la factura como
-- pagada, el egreso vinculado también se marca pagado (quote_items.pago_estado)
-- con la fecha real del pago. Antes solo admin/finanzas veían "Pagado" en el
-- Control de Egresos (leen facturas directo); los productores, bloqueados por
-- RLS, seguían viendo "Programado".
-- Los pagos de anticipo/comprobación no pasan por aquí: sus facturas se crean
-- sin quote_item_id (el flujo de /api/egresos/pay marca el egreso él mismo).

CREATE OR REPLACE FUNCTION trg_facturas_sync_pago_fecha() RETURNS trigger AS $$
BEGIN
  IF NEW.quote_item_id IS NULL THEN RETURN NULL; END IF;

  IF NEW.status = 'pagada' THEN
    UPDATE quote_items
       SET pago_estado = 'pagado',
           pago_fecha = COALESCE((NEW.paid_at AT TIME ZONE 'America/Mexico_City')::date, NEW.fecha_pago, pago_fecha)
     WHERE id = NEW.quote_item_id
       AND pago_estado IS DISTINCT FROM 'pagado';
  ELSIF NEW.status = 'aceptada' AND NEW.fecha_pago IS NOT NULL THEN
    UPDATE quote_items
       SET pago_fecha = NEW.fecha_pago
     WHERE id = NEW.quote_item_id
       AND pago_estado IS DISTINCT FROM 'pagado'
       AND pago_fecha IS DISTINCT FROM NEW.fecha_pago;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: facturas ya pagadas cuyo egreso sigue sin marcar.
UPDATE quote_items qi
   SET pago_estado = 'pagado',
       pago_fecha = COALESCE((f.paid_at AT TIME ZONE 'America/Mexico_City')::date, f.fecha_pago, qi.pago_fecha)
  FROM facturas f
 WHERE f.quote_item_id = qi.id
   AND f.status = 'pagada'
   AND qi.pago_estado IS DISTINCT FROM 'pagado';
