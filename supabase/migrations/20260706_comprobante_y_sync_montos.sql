-- 1) Comprobante de pago del banco (PDF/JPG) obligatorio al marcar pagada
--    una factura desde Finanzas; se guarda en storage y aquí su ruta.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS comprobante_path text;

-- 2) Sincronizar montos: al editar un egreso en el control de egresos
--    (actual_qty/days/unit_price), su factura vinculada POR PAGAR se
--    actualiza al nuevo monto. Aplica a facturas de proveedor
--    (facturas.quote_item_id) y a anticipos/reembolsos (quote_items.factura_id).
--    Las pagadas no se tocan: son historial de dinero que ya se movió.
CREATE OR REPLACE FUNCTION trg_quote_items_sync_factura_monto() RETURNS trigger AS $$
DECLARE v_monto numeric;
BEGIN
  -- Solo ítems con monto real capturado
  IF NEW.actual_qty IS NULL AND NEW.actual_days IS NULL AND NEW.actual_unit_price IS NULL THEN
    RETURN NULL;
  END IF;
  -- Misma fórmula que la app (EgresosPanel/montoEgreso)
  v_monto := round((coalesce(NEW.actual_qty, greatest(coalesce(NEW.qty, 0), 1))
                  * coalesce(NEW.actual_days, greatest(coalesce(NEW.days, 0), 1))
                  * coalesce(NEW.actual_unit_price, coalesce(NEW.unit_price, 0)))::numeric, 2);
  IF v_monto <= 0 THEN RETURN NULL; END IF;

  UPDATE facturas
     SET subtotal = v_monto
   WHERE status = 'aceptada'
     AND (quote_item_id = NEW.id OR id = NEW.factura_id)
     AND subtotal IS DISTINCT FROM v_monto;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS quote_items_sync_factura_monto ON quote_items;
CREATE TRIGGER quote_items_sync_factura_monto
  AFTER UPDATE OF actual_qty, actual_days, actual_unit_price ON quote_items
  FOR EACH ROW EXECUTE FUNCTION trg_quote_items_sync_factura_monto();

-- Backfill: corregir facturas por pagar que quedaron con monto viejo.
UPDATE facturas f
   SET subtotal = t.monto
  FROM (
    SELECT qi.id AS item_id, qi.factura_id,
           round((coalesce(qi.actual_qty, greatest(coalesce(qi.qty, 0), 1))
                * coalesce(qi.actual_days, greatest(coalesce(qi.days, 0), 1))
                * coalesce(qi.actual_unit_price, coalesce(qi.unit_price, 0)))::numeric, 2) AS monto
      FROM quote_items qi
     WHERE qi.actual_qty IS NOT NULL OR qi.actual_days IS NOT NULL OR qi.actual_unit_price IS NOT NULL
  ) t
 WHERE f.status = 'aceptada'
   AND (f.quote_item_id = t.item_id OR f.id = t.factura_id)
   AND t.monto > 0
   AND f.subtotal IS DISTINCT FROM t.monto;
