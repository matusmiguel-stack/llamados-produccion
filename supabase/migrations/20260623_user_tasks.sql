CREATE TABLE IF NOT EXISTS user_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date NOT NULL,
  due_time time,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own tasks"
  ON user_tasks
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
