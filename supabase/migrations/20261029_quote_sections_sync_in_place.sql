-- Guardar una cotización ya no borra sus rubros: los sincroniza en sitio.
--
-- Qué pasó (RS3045 Paquete MAX, 2026-10-29; RS3051 Banamex Buen Fin,
-- 2026-10-27): replace_quote_sections borraba TODAS las secciones y rubros de
-- la cotización y los volvía a insertar con ids nuevos cada vez que alguien
-- guardaba desde el editor (incluido el autosave). Como el control de egresos
-- cuelga de esos mismos renglones (quote_items.actual_*, pago_estado,
-- pago_tipo, pago_modo, pago_fecha, monto_comprobado, factura_id,
-- billing_sent_at, is_extra) y las facturas de proveedor apuntan a ellos
-- (facturas.quote_item_id ON DELETE SET NULL), renombrar un rubro bastaba
-- para que todos los pagos, comprobantes e instrucciones de facturación
-- "desaparecieran" del control de egresos y las facturas quedaran sueltas.
-- Encima, el editor intentaba conservar los reales emparejando por
-- "sección|descripción", así que con dos rubros del mismo nombre ("Caja
-- chica", "Planta de luz") los reales se cruzaban entre ellos.
--
-- Ahora:
--  * Las secciones se reconocen por nombre y los rubros por template_key
--    (predefinidos) o por descripción (adicionales); se ACTUALIZAN en sitio,
--    conservando id y todo lo que el control de egresos les colgó.
--  * Solo se borra un rubro que el editor ya no manda si está "limpio" (sin
--    reales, sin pagos, sin facturas, sin instrucciones). Si tiene datos de
--    egresos se conserva al final de su sección.
--  * Las secciones que el editor no manda no se tocan.
--  * Un trigger impide borrar (por cualquier vía) un rubro pagado o con
--    factura ligada: así nunca vuelve a quedar un pago huérfano.
--
-- Aplicada el 2026-10-29 vía Management API.

CREATE OR REPLACE FUNCTION replace_quote_sections(p_quote_id uuid, p_sections jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_section    jsonb;
  v_item       jsonb;
  v_section_id uuid;
  v_item_id    uuid;
  v_matched    uuid[];
  v_legacy     boolean;   -- sección guardada antes de template_key: se reconoce por posición
  v_tk         text;
  v_desc       text;
  v_order      int;
  v_pos        int;
  v_rest       record;
BEGIN
  -- Mismo control de acceso que las políticas RLS que reemplaza esta función
  -- (SECURITY DEFINER se salta RLS, así que se revisa a mano aquí).
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'editor', 'editor_premium')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para editar cotizaciones';
  END IF;

  FOR v_section IN SELECT * FROM jsonb_array_elements(p_sections)
  LOOP
    SELECT id INTO v_section_id
      FROM quote_sections
     WHERE quote_id = p_quote_id AND name = v_section->>'name'
     ORDER BY order_index NULLS LAST, created_at
     LIMIT 1;

    IF v_section_id IS NULL THEN
      INSERT INTO quote_sections (quote_id, name, order_index)
      VALUES (p_quote_id, v_section->>'name', (v_section->>'order_index')::int)
      RETURNING id INTO v_section_id;
    ELSE
      UPDATE quote_sections
         SET order_index = (v_section->>'order_index')::int
       WHERE id = v_section_id
         AND order_index IS DISTINCT FROM (v_section->>'order_index')::int;
    END IF;

    v_legacy  := NOT EXISTS (SELECT 1 FROM quote_items WHERE section_id = v_section_id AND template_key IS NOT NULL);
    v_matched := '{}';

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_section->'items')
    LOOP
      v_tk    := NULLIF(v_item->>'template_key', '');
      v_desc  := v_item->>'description';
      v_order := (v_item->>'order_index')::int;
      v_item_id := NULL;

      -- 1) Predefinido: por su clave de plantilla
      IF v_tk IS NOT NULL THEN
        SELECT id INTO v_item_id FROM quote_items
         WHERE section_id = v_section_id AND template_key = v_tk
           AND NOT (id = ANY(v_matched))
         ORDER BY order_index NULLS LAST, created_at
         LIMIT 1;
      END IF;

      -- 2) Adicional (o predefinido de una cotización vieja, aún sin clave):
      --    por descripción entre los rubros sin clave; si hay varios iguales,
      --    el de la misma posición. Un predefinido nuevo en una cotización
      --    moderna NO se empareja por nombre con un adicional: se inserta.
      IF v_item_id IS NULL AND (v_tk IS NULL OR v_legacy) THEN
        SELECT id INTO v_item_id FROM quote_items
         WHERE section_id = v_section_id AND template_key IS NULL
           AND description = v_desc
           AND NOT (id = ANY(v_matched))
         ORDER BY (order_index = v_order) DESC, order_index NULLS LAST, created_at
         LIMIT 1;
      END IF;

      -- 3) Cotización vieja (sin claves) y predefinido renombrado: el editor
      --    lo identifica por posición en la plantilla; aquí igual.
      IF v_item_id IS NULL AND v_tk IS NOT NULL AND v_legacy THEN
        SELECT id INTO v_item_id FROM quote_items
         WHERE section_id = v_section_id AND template_key IS NULL
           AND order_index = v_order
           AND NOT (id = ANY(v_matched))
         LIMIT 1;
      END IF;

      IF v_item_id IS NOT NULL THEN
        -- Solo lo que es de la cotización. Los reales, pagos, facturas e
        -- instrucciones NO se tocan: son del control de egresos.
        UPDATE quote_items
           SET description      = v_desc,
               qty              = (v_item->>'qty')::numeric,
               days             = (v_item->>'days')::numeric,
               unit_price       = (v_item->>'unit_price')::numeric,
               released_expense = (v_item->>'released_expense')::numeric,
               real_expense     = (v_item->>'real_expense')::numeric,
               supplier         = v_item->>'supplier',
               order_index      = v_order,
               template_key     = COALESCE(v_tk, template_key)
         WHERE id = v_item_id
           AND (description      IS DISTINCT FROM v_desc
             OR qty              IS DISTINCT FROM (v_item->>'qty')::numeric
             OR days             IS DISTINCT FROM (v_item->>'days')::numeric
             OR unit_price       IS DISTINCT FROM (v_item->>'unit_price')::numeric
             OR released_expense IS DISTINCT FROM (v_item->>'released_expense')::numeric
             OR real_expense     IS DISTINCT FROM (v_item->>'real_expense')::numeric
             OR supplier         IS DISTINCT FROM (v_item->>'supplier')
             OR order_index      IS DISTINCT FROM v_order
             OR template_key     IS DISTINCT FROM COALESCE(v_tk, template_key));
      ELSE
        INSERT INTO quote_items (
          section_id, description, qty, days, unit_price, released_expense, real_expense,
          supplier, order_index, template_key,
          actual_qty, actual_days, actual_unit_price, actual_supplier_id, actual_employee_id
        ) VALUES (
          v_section_id,
          v_desc,
          (v_item->>'qty')::numeric,
          (v_item->>'days')::numeric,
          (v_item->>'unit_price')::numeric,
          (v_item->>'released_expense')::numeric,
          (v_item->>'real_expense')::numeric,
          v_item->>'supplier',
          v_order,
          v_tk,
          (v_item->>'actual_qty')::numeric,
          (v_item->>'actual_days')::numeric,
          (v_item->>'actual_unit_price')::numeric,
          (v_item->>'actual_supplier_id')::uuid,
          (v_item->>'actual_employee_id')::uuid
        )
        RETURNING id INTO v_item_id;
      END IF;

      v_matched := v_matched || v_item_id;
    END LOOP;

    -- Rubros que el editor ya no manda: se borran solo si están limpios.
    DELETE FROM quote_items qi
     WHERE qi.section_id = v_section_id
       AND NOT (qi.id = ANY(v_matched))
       AND qi.actual_qty IS NULL AND qi.actual_days IS NULL AND qi.actual_unit_price IS NULL
       AND qi.actual_supplier_id IS NULL AND qi.actual_employee_id IS NULL
       AND qi.billing_sent_at IS NULL
       AND qi.pago_estado IS NULL AND qi.pago_tipo IS NULL AND qi.pago_modo IS NULL AND qi.pago_fecha IS NULL
       AND qi.factura_id IS NULL AND COALESCE(qi.monto_comprobado, 0) = 0
       AND NOT COALESCE(qi.is_extra, false) AND NOT COALESCE(qi.requiere_anticipo, false)
       AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.quote_item_id = qi.id);

    -- Los que tienen datos de egresos se conservan, al final de la sección.
    v_pos := COALESCE(jsonb_array_length(v_section->'items'), 0);
    FOR v_rest IN
      SELECT id FROM quote_items
       WHERE section_id = v_section_id AND NOT (id = ANY(v_matched))
       ORDER BY order_index NULLS LAST, created_at
    LOOP
      UPDATE quote_items SET order_index = v_pos
       WHERE id = v_rest.id AND order_index IS DISTINCT FROM v_pos;
      v_pos := v_pos + 1;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION replace_quote_sections(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION replace_quote_sections(uuid, jsonb) TO authenticated;

-- ── Candado: un rubro pagado o con factura ligada no se borra por ninguna vía ──
-- (La UI de egresos ya lo impedía, pero la página de liberación y el borrado
-- en cascada de secciones/cotizaciones no; así se borró "Seguridad" de RS3045
-- con su comprobación ya registrada y la factura quedó huérfana.)
CREATE OR REPLACE FUNCTION bloquear_borrado_rubro_pagado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.pago_estado = 'pagado'
     OR OLD.factura_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM facturas f WHERE f.quote_item_id = OLD.id AND f.status <> 'rechazada')
  THEN
    RAISE EXCEPTION 'No se puede borrar el rubro "%": ya tiene un pago o una factura ligada', OLD.description
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_items_no_borrar_pagados ON quote_items;
CREATE TRIGGER trg_quote_items_no_borrar_pagados
  BEFORE DELETE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION bloquear_borrado_rubro_pagado();
