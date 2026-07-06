-- Cuando un proveedor mete su factura y se le programa fecha de pago, esa
-- fecha se copia automáticamente al egreso vinculado (quote_items.pago_fecha)
-- para que el Control de Egresos muestre "Programado" con la fecha en lugar
-- de "Sin fecha". No pisa la fecha real de pago de egresos ya pagados.

CREATE OR REPLACE FUNCTION trg_facturas_sync_pago_fecha() RETURNS trigger AS $$
BEGIN
  IF NEW.quote_item_id IS NOT NULL
     AND NEW.fecha_pago IS NOT NULL
     AND NEW.status IN ('aceptada', 'pagada') THEN
    UPDATE quote_items
       SET pago_fecha = NEW.fecha_pago
     WHERE id = NEW.quote_item_id
       AND pago_estado IS DISTINCT FROM 'pagado'
       AND pago_fecha IS DISTINCT FROM NEW.fecha_pago;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS facturas_sync_pago_fecha ON facturas;
CREATE TRIGGER facturas_sync_pago_fecha
  AFTER INSERT OR UPDATE OF fecha_pago, quote_item_id, status ON facturas
  FOR EACH ROW EXECUTE FUNCTION trg_facturas_sync_pago_fecha();

-- Backfill: facturas aceptadas/pagadas ya vinculadas a un egreso sin fecha.
UPDATE quote_items qi
   SET pago_fecha = f.fecha_pago
  FROM facturas f
 WHERE f.quote_item_id = qi.id
   AND f.status IN ('aceptada', 'pagada')
   AND f.fecha_pago IS NOT NULL
   AND qi.pago_estado IS DISTINCT FROM 'pagado'
   AND qi.pago_fecha IS NULL;
