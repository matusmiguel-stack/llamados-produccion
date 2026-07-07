-- El sync factura→egreso solo cubría el vínculo facturas.quote_item_id
-- (facturas de proveedor). Los reembolsos (y en general los egresos que
-- apuntan a su factura por quote_items.factura_id) no se marcaban como pagados
-- al pagar la factura desde Finanzas. Ahora el trigger cubre ambos sentidos.
CREATE OR REPLACE FUNCTION trg_facturas_sync_pago_fecha() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'pagada' THEN
    UPDATE quote_items
       SET pago_estado = 'pagado',
           pago_fecha = COALESCE((NEW.paid_at AT TIME ZONE 'America/Mexico_City')::date, NEW.fecha_pago, pago_fecha)
     WHERE (id = NEW.quote_item_id OR factura_id = NEW.id)
       AND pago_estado IS DISTINCT FROM 'pagado';
  ELSIF NEW.status = 'aceptada' AND NEW.fecha_pago IS NOT NULL THEN
    UPDATE quote_items
       SET pago_fecha = NEW.fecha_pago
     WHERE (id = NEW.quote_item_id OR factura_id = NEW.id)
       AND pago_estado IS DISTINCT FROM 'pagado'
       AND pago_fecha IS DISTINCT FROM NEW.fecha_pago;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: egresos vinculados por factura_id a una factura ya pagada que
-- quedaron sin marcar (p. ej. el reembolso pagado antes de este arreglo).
UPDATE quote_items qi
   SET pago_estado = 'pagado',
       pago_fecha = COALESCE((f.paid_at AT TIME ZONE 'America/Mexico_City')::date, f.fecha_pago, qi.pago_fecha)
  FROM facturas f
 WHERE qi.factura_id = f.id
   AND f.status = 'pagada'
   AND qi.pago_estado IS DISTINCT FROM 'pagado';
