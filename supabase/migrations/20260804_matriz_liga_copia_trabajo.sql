-- Nuevo campo de la matriz de proyecto: "Liga Copia de Trabajo",
-- que va justo debajo de "Liga de masters".
--
-- Aplicada el 2026-08-04 vía Management API.

ALTER TABLE project_matrices
  ADD COLUMN IF NOT EXISTS liga_copia_trabajo text DEFAULT ''::text;
