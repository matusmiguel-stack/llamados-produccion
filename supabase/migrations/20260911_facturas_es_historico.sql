-- Deuda histórica a proveedores (previa a la app), importada desde Excel.
--
-- Se guarda en `facturas` como cualquier otra deuda (status 'aceptada' =
-- por pagar, 'pagada' cuando se liquide) pero SIN project_id real —
-- codigo_proyecto lleva el nombre del proyecto como texto libre, tal cual
-- venía en el Excel. `es_historico` distingue estos registros para que:
--   - Finanzas los reporte aparte ("Total por pagar (pasadas)" /
--     "Total pagadas (pasadas)"), sin mezclarse con la deuda que genera
--     la app día a día.
--   - La ficha del proveedor le ponga un badge "PASADO".
--
-- Aplicada el 2026-09-11 vía Management API.

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS facturas_es_historico_idx ON facturas (es_historico) WHERE es_historico;
