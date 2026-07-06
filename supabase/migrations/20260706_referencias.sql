-- Módulo REFERENCIAS: tableros por proyecto donde cualquier usuario de la app
-- guarda links de referencia (Instagram, YouTube, TikTok, etc.) con el nombre
-- de quien subió cada una.

CREATE TABLE IF NOT EXISTS referencia_proyectos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referencias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proyecto_id uuid NOT NULL REFERENCES referencia_proyectos(id) ON DELETE CASCADE,
  url text NOT NULL,
  titulo text,
  nota text,
  fuente text, -- instagram | youtube | tiktok | vimeo | pinterest | web | ...
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referencias_proyecto_idx ON referencias (proyecto_id, created_at);

ALTER TABLE referencia_proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE referencias ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden ver y crear; borrar/editar solo lo
-- propio (o admin).
CREATE POLICY "authenticated pueden leer referencia_proyectos"
  ON referencia_proyectos FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated pueden crear referencia_proyectos"
  ON referencia_proyectos FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "dueño o admin pueden editar referencia_proyectos"
  ON referencia_proyectos FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "dueño o admin pueden borrar referencia_proyectos"
  ON referencia_proyectos FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "authenticated pueden leer referencias"
  ON referencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated pueden crear referencias"
  ON referencias FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "dueño o admin pueden editar referencias"
  ON referencias FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "dueño o admin pueden borrar referencias"
  ON referencias FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
