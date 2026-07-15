-- Permitir varias matrices por proyecto, cada una con nombre propio.
-- Aplicada el 2026-07-15 vía Management API.

ALTER TABLE project_matrices DROP CONSTRAINT IF EXISTS project_matrices_project_id_key;
ALTER TABLE project_matrices ADD COLUMN IF NOT EXISTS nombre text NOT NULL DEFAULT '';
UPDATE project_matrices SET nombre = 'Matriz 1' WHERE nombre = '';
