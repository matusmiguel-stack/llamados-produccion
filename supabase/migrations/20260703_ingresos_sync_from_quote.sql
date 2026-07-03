-- Mantiene el subtotal/IVA del ingreso SIEMPRE en sync con su cotización.
-- Antes, ingresos.subtotal se fijaba al aprobar y no se actualizaba si después
-- se modificaba la cotización, dejando montos desfasados en el Control de Ingresos.
--
-- Fórmula (misma que la cotización y el panel de información general):
--   venta    = Σ (qty*days*unit_price * (1 + released_expense/100))  [incluye internos y comisión]
--   subtotal = venta * (1 + markup_general/100)
--   iva      = subtotal * 0.16

CREATE OR REPLACE FUNCTION sync_ingreso_from_quote(p_quote_id uuid)
RETURNS void AS $$
DECLARE
  v_venta numeric;
  v_markup numeric;
  v_subtotal numeric;
BEGIN
  IF p_quote_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM ingresos WHERE quote_id = p_quote_id) THEN RETURN; END IF;

  SELECT coalesce(sum(qi.qty * qi.days * qi.unit_price * (1 + coalesce(qi.released_expense,0)/100.0)), 0)
    INTO v_venta
    FROM quote_items qi
    JOIN quote_sections qs ON qs.id = qi.section_id
    WHERE qs.quote_id = p_quote_id;

  SELECT coalesce(markup_percentage, 0) INTO v_markup FROM quotes WHERE id = p_quote_id;

  v_subtotal := round((v_venta * (1 + v_markup/100.0))::numeric, 2);

  UPDATE ingresos
     SET subtotal = v_subtotal,
         iva = round((v_subtotal * 0.16)::numeric, 2),
         updated_at = now()
   WHERE quote_id = p_quote_id
     AND (subtotal IS DISTINCT FROM v_subtotal);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: cualquier cambio en ítems de cotización re-sincroniza el ingreso ligado.
CREATE OR REPLACE FUNCTION trg_quote_items_sync_ingreso() RETURNS trigger AS $$
DECLARE v_quote uuid;
BEGIN
  SELECT quote_id INTO v_quote FROM quote_sections WHERE id = coalesce(NEW.section_id, OLD.section_id);
  PERFORM sync_ingreso_from_quote(v_quote);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS quote_items_sync_ingreso ON quote_items;
CREATE TRIGGER quote_items_sync_ingreso
  AFTER INSERT OR UPDATE OR DELETE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION trg_quote_items_sync_ingreso();

-- Trigger: cambio del markup general de la cotización.
CREATE OR REPLACE FUNCTION trg_quotes_sync_ingreso() RETURNS trigger AS $$
BEGIN
  IF NEW.markup_percentage IS DISTINCT FROM OLD.markup_percentage THEN
    PERFORM sync_ingreso_from_quote(NEW.id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS quotes_sync_ingreso ON quotes;
CREATE TRIGGER quotes_sync_ingreso
  AFTER UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION trg_quotes_sync_ingreso();

-- Backfill de datos existentes.
SELECT sync_ingreso_from_quote(quote_id)
  FROM (SELECT DISTINCT quote_id FROM ingresos WHERE quote_id IS NOT NULL) t;
