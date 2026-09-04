-- Compartir una matriz con alguien de fuera, en solo lectura.
--
-- `share_token` es una liga secreta al estilo "cualquiera con el enlace":
--   NULL  = la matriz no está compartida
--   texto = token largo y aleatorio que abre la vista pública
--
-- La vista pública NO consulta la tabla desde el navegador: pasa por una API
-- que valida el token con el cliente admin y devuelve únicamente esa matriz.
-- Por eso aquí no se agrega ninguna política de lectura anónima: las policies
-- siguen exigiendo sesión para todo lo demás.
--
-- Aplicada el 2026-09-03 vía Management API.

ALTER TABLE project_matrices
  ADD COLUMN IF NOT EXISTS share_token text;

-- Dos matrices no pueden compartir token; el índice además acelera la búsqueda
-- por token, que es como entra la vista pública.
CREATE UNIQUE INDEX IF NOT EXISTS project_matrices_share_token_key
  ON project_matrices (share_token)
  WHERE share_token IS NOT NULL;
