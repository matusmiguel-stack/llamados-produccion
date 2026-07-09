-- Finanzas puede capturar ingresos MANUALES (sin proyecto) además de ver y
-- actualizar. Los ingresos ligados a un proyecto siguen siendo solo de admin/
-- editor_premium (sus montos los dicta la cotización aprobada).

-- INSERT: admin/editor_premium sin restricción; finanzas solo ingresos manuales.
DROP POLICY IF EXISTS "Admins y editor_premium pueden insertar ingresos" ON ingresos;
CREATE POLICY "Insertar ingresos" ON ingresos FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ANY (ARRAY['admin','editor_premium']))
  OR (
    project_id IS NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'finanzas')
  )
);

-- DELETE: admin cualquiera; finanzas solo ingresos manuales (sin proyecto).
DROP POLICY IF EXISTS "Solo admins pueden eliminar ingresos" ON ingresos;
CREATE POLICY "Eliminar ingresos" ON ingresos FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  OR (
    project_id IS NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'finanzas')
  )
);
