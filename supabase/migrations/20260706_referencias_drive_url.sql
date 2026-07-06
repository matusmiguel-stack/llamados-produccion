-- Las cuentas de servicio de Google no pueden crear archivos en Drive (sin
-- cuota de almacenamiento), así que cada proyecto de referencias se sincroniza
-- como PESTAÑA de una sola hoja de cálculo compartida. drive_sheet_id ahora
-- guarda el gid de la pestaña y drive_url el link directo para el frontend.
ALTER TABLE referencia_proyectos ADD COLUMN IF NOT EXISTS drive_url text;
-- Limpiar ids de la versión anterior (eran ids de archivo, ya no aplican).
UPDATE referencia_proyectos SET drive_sheet_id = NULL WHERE drive_url IS NULL;
