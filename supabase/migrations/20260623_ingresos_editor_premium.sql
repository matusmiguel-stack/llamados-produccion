-- Allow editor_premium to insert and read ingresos (needed for quote approval flow)
-- UPDATE and DELETE remain admin-only

DROP POLICY "Solo admins pueden insertar ingresos" ON ingresos;
CREATE POLICY "Admins y editor_premium pueden insertar ingresos" ON ingresos
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'editor_premium'::text])
  ));

DROP POLICY "Solo admins pueden ver ingresos" ON ingresos;
CREATE POLICY "Admins y editor_premium pueden ver ingresos" ON ingresos
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'editor_premium'::text])
  ));
