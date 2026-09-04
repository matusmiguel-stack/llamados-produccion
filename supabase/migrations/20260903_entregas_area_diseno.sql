-- Calendario de Diseño: reutiliza la tabla `entregas` (misma forma: título,
-- tipo, fechas, cliente, proyecto, responsables, notas) y las separa por área.
--
-- Se prefiere una columna sobre una tabla nueva para no duplicar la maquinaria
-- que ya existe (RLS por rol, avisos de "entrega hoy", resumen diario).
--
-- Las filas existentes son todas de postproducción, así que el DEFAULT las
-- deja bien sin necesidad de backfill.
--
-- Aplicada el 2026-09-03 vía Management API.

ALTER TABLE entregas
  ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT 'postproduccion';

-- Solo las dos áreas que existen hoy; si mañana hay otra, se amplía aquí.
ALTER TABLE entregas DROP CONSTRAINT IF EXISTS entregas_area_check;
ALTER TABLE entregas
  ADD CONSTRAINT entregas_area_check CHECK (area IN ('postproduccion', 'diseno'));

-- Los calendarios siempre filtran por área.
CREATE INDEX IF NOT EXISTS entregas_area_fecha_idx ON entregas (area, fecha);
