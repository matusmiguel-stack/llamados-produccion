-- Semáforo de calidad por referencia (verde/amarillo/rojo). Solo Miguel y
-- Regina califican — el permiso se valida en /api/referencias/rate, que
-- escribe con el cliente admin.
ALTER TABLE referencias ADD COLUMN IF NOT EXISTS semaforo text
  CHECK (semaforo IN ('verde', 'amarillo', 'rojo'));
