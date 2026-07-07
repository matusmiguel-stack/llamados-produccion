-- Monto final a pagar (neto de IVA y retenciones), leído del atributo Total del
-- CFDI. Para facturas normales Total ≈ subtotal×1.16; para recibos de
-- honorarios el SAT ya descuenta ISR e IVA retenidos, así que Total < subtotal+IVA.
-- Finanzas muestra este total (no el subtotal). Los pagos internos sin CFDI
-- (anticipo/comprobación/reembolso) usan total = subtotal como respaldo.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS total numeric;

-- Respaldo para las que no tienen CFDI: total = subtotal.
UPDATE facturas SET total = subtotal WHERE total IS NULL AND xml_path IS NULL AND subtotal IS NOT NULL;
-- (El backfill de las que sí tienen CFDI se hizo leyendo el Total de cada XML.)

-- El trigger de sincronización de montos (egreso→factura) ahora también escala
-- el total neto en la misma proporción que el subtotal.
CREATE OR REPLACE FUNCTION trg_quote_items_sync_factura_monto() RETURNS trigger AS $$
DECLARE v_monto numeric;
BEGIN
  IF NEW.actual_qty IS NULL AND NEW.actual_days IS NULL AND NEW.actual_unit_price IS NULL THEN
    RETURN NULL;
  END IF;
  v_monto := round((coalesce(NEW.actual_qty, greatest(coalesce(NEW.qty, 0), 1))
                  * coalesce(NEW.actual_days, greatest(coalesce(NEW.days, 0), 1))
                  * coalesce(NEW.actual_unit_price, coalesce(NEW.unit_price, 0)))::numeric, 2);
  IF v_monto <= 0 THEN RETURN NULL; END IF;

  UPDATE facturas
     SET subtotal = v_monto,
         total = CASE WHEN subtotal IS NOT NULL AND subtotal > 0 AND total IS NOT NULL
                      THEN round((v_monto * total / subtotal)::numeric, 2)
                      ELSE v_monto END
   WHERE status = 'aceptada'
     AND (quote_item_id = NEW.id OR id = NEW.factura_id)
     AND subtotal IS DISTINCT FROM v_monto;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
