-- Proyectos de "gastos internos": no dependen de una cotización ni entran a
-- Ingresos; solo sirven para capturar egresos internos de Retro y que los
-- proveedores puedan facturarlos. Reutilizan toda la maquinaria de egresos
-- (quote_items de una cotización liberada "vacía" por debajo).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS gastos_internos boolean NOT NULL DEFAULT false;

-- Los productores solo tienen lectura sobre quote_items; se les da escritura
-- ACOTADA a los proyectos de gastos internos (para poder meter/editar gastos).
DROP POLICY IF EXISTS "Productores gestionan gastos internos" ON quote_items;
CREATE POLICY "Productores gestionan gastos internos"
  ON quote_items FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'productor')
    AND EXISTS (
      SELECT 1 FROM quote_sections qs
        JOIN quotes q   ON q.id = qs.quote_id
        JOIN projects p ON p.id = q.project_id
       WHERE qs.id = quote_items.section_id AND p.gastos_internos = true
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'productor')
    AND EXISTS (
      SELECT 1 FROM quote_sections qs
        JOIN quotes q   ON q.id = qs.quote_id
        JOIN projects p ON p.id = q.project_id
       WHERE qs.id = quote_items.section_id AND p.gastos_internos = true
    )
  );

-- Proyecto RS0000 "Gastos internos Retro" bajo el cliente Retro, con su
-- cotización liberada + sección donde se cuelgan los gastos. Idempotente.
DO $$
DECLARE v_proj uuid; v_quote uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE code = 'RS0000') THEN
    INSERT INTO projects (client_id, subfolder_id, name, code, gastos_internos, empresa, updated_at)
    VALUES ('22650ccc-0dbc-4445-b4fb-6df991a37cca', '67e1b43b-e095-44f7-b559-0e0ff06379b0',
            'Gastos internos Retro', 'RS0000', true, NULL, now())
    RETURNING id INTO v_proj;

    INSERT INTO quotes (project_id, name, status, released)
    VALUES (v_proj, 'Gastos internos', 'draft', true)
    RETURNING id INTO v_quote;

    INSERT INTO quote_sections (quote_id, name, order_index)
    VALUES (v_quote, 'Gastos internos', 0);
  END IF;
END $$;
