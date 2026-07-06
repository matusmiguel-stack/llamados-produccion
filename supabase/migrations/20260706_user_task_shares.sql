-- Tareas compartidas: el dueño de una tarea puede compartirla con otros
-- usuarios; a ellos les aparece en Mis Tareas y pueden completarla.
-- Editar y borrar sigue siendo solo del dueño. completed_by registra quién
-- la marcó como hecha.

CREATE TABLE IF NOT EXISTS user_task_shares (
  task_id uuid NOT NULL REFERENCES user_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES profiles(id);

-- Helpers SECURITY DEFINER: las políticas de user_tasks y user_task_shares se
-- referencian mutuamente; sin esto Postgres detecta recursión infinita de RLS.
CREATE OR REPLACE FUNCTION task_shared_with_me(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_task_shares WHERE task_id = p_task AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION task_owned_by_me(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_tasks WHERE id = p_task AND user_id = auth.uid());
$$;

ALTER TABLE user_task_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver shares propios o de mis tareas"
  ON user_task_shares FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR task_owned_by_me(task_id));
CREATE POLICY "dueño comparte sus tareas"
  ON user_task_shares FOR INSERT TO authenticated
  WITH CHECK (task_owned_by_me(task_id));
CREATE POLICY "dueño o compartido quitan el share"
  ON user_task_shares FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR task_owned_by_me(task_id));

-- user_tasks: reemplazar la política única (solo dueño) por políticas
-- separadas que dejan LEER y ACTUALIZAR (completar) a los compartidos.
DROP POLICY IF EXISTS "users can manage own tasks" ON user_tasks;

CREATE POLICY "leer tareas propias o compartidas"
  ON user_tasks FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR task_shared_with_me(id));
CREATE POLICY "crear tareas propias"
  ON user_tasks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "actualizar tareas propias o compartidas"
  ON user_tasks FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR task_shared_with_me(id))
  WITH CHECK (user_id = auth.uid() OR task_shared_with_me(id));
CREATE POLICY "borrar tareas propias"
  ON user_tasks FOR DELETE TO authenticated
  USING (user_id = auth.uid());
