-- Productores generan las sub-listas de egresos. Se les da escritura ACOTADA
-- sobre quote_sections (sub-listas) y sobre quotes (cotización contenedora),
-- únicamente en proyectos de gastos internos o con egresos directos.
--
-- Aplicada el 2026-07-20 vía Management API.

-- Sub-listas (secciones de la cotización contenedora)
DROP POLICY IF EXISTS "Productores gestionan sub-listas de egresos" ON quote_sections;
CREATE POLICY "Productores gestionan sub-listas de egresos"
  ON quote_sections FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'productor')
    AND EXISTS (
      SELECT 1 FROM quotes q JOIN projects p ON p.id = q.project_id
       WHERE q.id = quote_sections.quote_id
         AND (p.gastos_internos = true OR p.egresos_directos = true)
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'productor')
    AND EXISTS (
      SELECT 1 FROM quotes q JOIN projects p ON p.id = q.project_id
       WHERE q.id = quote_sections.quote_id
         AND (p.gastos_internos = true OR p.egresos_directos = true)
    )
  );

-- Cotización contenedora de egresos (para poder crearla la primera vez)
DROP POLICY IF EXISTS "Productores gestionan cotizacion de egresos" ON quotes;
CREATE POLICY "Productores gestionan cotizacion de egresos"
  ON quotes FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'productor')
    AND EXISTS (
      SELECT 1 FROM projects p
       WHERE p.id = quotes.project_id
         AND (p.gastos_internos = true OR p.egresos_directos = true)
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'productor')
    AND EXISTS (
      SELECT 1 FROM projects p
       WHERE p.id = quotes.project_id
         AND (p.gastos_internos = true OR p.egresos_directos = true)
    )
  );
