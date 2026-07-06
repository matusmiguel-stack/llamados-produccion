-- Vincula cada proyecto de referencias con su hoja de Google Sheets en el
-- Drive compartido (para gente sin acceso a la app).
ALTER TABLE referencia_proyectos ADD COLUMN IF NOT EXISTS drive_sheet_id text;
