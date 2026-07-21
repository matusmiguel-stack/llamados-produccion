-- Egresos directos + sub-listas.
--
-- 1) `projects.egresos_directos`: toggle por proyecto (además de gastos_internos)
--    que habilita capturar egresos a mano en Control de Egresos, sin cotización.
--    A diferencia de gastos_internos, el proyecto conserva matriz y cotización.
-- 2) `quotes.egresos_directos`: marca la cotización "contenedora" (liberada,
--    vacía) cuyas secciones son las sub-listas de egresos (ej. "Recetas Julio",
--    "Salmón", "Trends"). Todas comparten el mismo código de proyecto.
--
-- Aplicada el 2026-07-20 vía Management API.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS egresos_directos boolean NOT NULL DEFAULT false;
ALTER TABLE quotes   ADD COLUMN IF NOT EXISTS egresos_directos boolean NOT NULL DEFAULT false;

-- Los proyectos de gastos internos (RS0000) ya tienen su cotización liberada
-- con una sección; la marcamos como contenedora para unificar la lógica de
-- sub-listas (esa sección pasa a ser la primera sub-lista).
UPDATE quotes SET egresos_directos = true
 WHERE released = true
   AND project_id IN (SELECT id FROM projects WHERE gastos_internos = true);

-- Escritura acotada de gastos para productores: igual que en gastos_internos,
-- ahora también en proyectos con egresos_directos.
DROP POLICY IF EXISTS "Productores gestionan gastos internos" ON quote_items;
CREATE POLICY "Productores gestionan gastos internos"
  ON quote_items FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'productor')
    AND EXISTS (
      SELECT 1 FROM quote_sections qs
        JOIN quotes q   ON q.id = qs.quote_id
        JOIN projects p ON p.id = q.project_id
       WHERE qs.id = quote_items.section_id
         AND (p.gastos_internos = true OR p.egresos_directos = true)
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'productor')
    AND EXISTS (
      SELECT 1 FROM quote_sections qs
        JOIN quotes q   ON q.id = qs.quote_id
        JOIN projects p ON p.id = q.project_id
       WHERE qs.id = quote_items.section_id
         AND (p.gastos_internos = true OR p.egresos_directos = true)
    )
  );
