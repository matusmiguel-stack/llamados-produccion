-- Las líneas "… - Liquidación" (remanente de una facturación parcial) nacen
-- desvinculadas del proyecto para que finanzas pueda editarlas como ingresos
-- manuales. Esta columna guarda el proyecto de origen SOLO para que el nombre
-- siga siendo un hipervínculo al proyecto — no activa el candado de finanzas
-- ni ninguna lógica de ingresos ligados.
--
-- Aplicada el 2026-07-17 vía Management API.

ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS liquidacion_project_id uuid
  REFERENCES projects(id) ON DELETE SET NULL;
