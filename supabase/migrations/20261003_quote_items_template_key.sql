-- Reordenar los conceptos de una cotización con drag and drop.
--
-- Hasta ahora quote_items.order_index cumplía DOS funciones: el orden en que se
-- presentan los conceptos y, al reabrir la cotización, la forma de reconocer
-- cuál concepto predefinido es cuál (por su posición en la plantilla de
-- app/cotizaciones/page.tsx). Para poder reordenar sin romper eso, la
-- identidad pasa a template_key (id del concepto predefinido, NULL en los
-- conceptos adicionales) y order_index queda como el orden real de
-- presentación, que ya respetan el PDF, Liberar, Egresos y la Hoja de llamado.
--
-- Las cotizaciones guardadas antes de esto no tienen template_key: el editor
-- las sigue leyendo por posición (regla anterior) hasta el siguiente guardado.
--
-- Aplicada el 2026-10-03 vía Management API.

ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS template_key text;

CREATE OR REPLACE FUNCTION replace_quote_sections(p_quote_id uuid, p_sections jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_section_ids uuid[];
  v_section jsonb;
  v_item jsonb;
  v_new_section_id uuid;
BEGIN
  -- Mismo control de acceso que las políticas RLS que reemplaza esta función
  -- (SECURITY DEFINER se salta RLS, así que se revisa a mano aquí).
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'editor', 'editor_premium')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para editar cotizaciones';
  END IF;

  SELECT array_agg(id) INTO v_old_section_ids FROM quote_sections WHERE quote_id = p_quote_id;
  IF v_old_section_ids IS NOT NULL THEN
    DELETE FROM quote_items WHERE section_id = ANY(v_old_section_ids);
    DELETE FROM quote_sections WHERE quote_id = p_quote_id;
  END IF;

  FOR v_section IN SELECT * FROM jsonb_array_elements(p_sections)
  LOOP
    INSERT INTO quote_sections (quote_id, name, order_index)
    VALUES (p_quote_id, v_section->>'name', (v_section->>'order_index')::int)
    RETURNING id INTO v_new_section_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_section->'items')
    LOOP
      INSERT INTO quote_items (
        section_id, description, qty, days, unit_price, released_expense, real_expense,
        supplier, order_index, actual_qty, actual_days, actual_unit_price, actual_supplier_id,
        actual_employee_id, template_key
      ) VALUES (
        v_new_section_id,
        v_item->>'description',
        (v_item->>'qty')::numeric,
        (v_item->>'days')::numeric,
        (v_item->>'unit_price')::numeric,
        (v_item->>'released_expense')::numeric,
        (v_item->>'real_expense')::numeric,
        v_item->>'supplier',
        (v_item->>'order_index')::int,
        (v_item->>'actual_qty')::numeric,
        (v_item->>'actual_days')::numeric,
        (v_item->>'actual_unit_price')::numeric,
        (v_item->>'actual_supplier_id')::uuid,
        (v_item->>'actual_employee_id')::uuid,
        v_item->>'template_key'
      );
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION replace_quote_sections(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION replace_quote_sections(uuid, jsonb) TO authenticated;
