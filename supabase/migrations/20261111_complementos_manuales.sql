-- Complementos de pago manuales y facturas independientes PPD.
--
-- Hasta hoy el complemento (CFDI tipo P) solo salía al marcar pagada una
-- línea de Ingresos con factura PPD: uno por línea (ingreso_id único). Ahora
-- finanzas también puede emitirlo "a mano" para cualquier factura PPD (de
-- Ingresos o independiente), con su propio monto, fecha y forma de pago, y
-- cancelarlo si salió mal.
--
--  * ingreso_id deja de ser obligatorio: los manuales se ligan a la FACTURA
--    (factura_uuid), no a una línea de Ingresos.
--  * empresa: quién emite (antes salía del ingreso).
--  * origen: auto (al marcar pagado) | manual.
--  * estatus: vigente | cancelada. La parcialidad y el saldo solo cuentan los
--    vigentes, y el "uno por línea" de los automáticos también.
--  * factura_numero / receptor_nombre: para listarlos sin cruzar tablas.
--  * Borrar un ingreso ya no borra el registro de un complemento timbrado
--    ante el SAT (ON DELETE SET NULL en vez de CASCADE).
--
-- Aplicada el 2026-11-11 vía Management API.

ALTER TABLE complementos_pago ALTER COLUMN ingreso_id DROP NOT NULL;

ALTER TABLE complementos_pago DROP CONSTRAINT IF EXISTS complementos_pago_ingreso_id_fkey;
ALTER TABLE complementos_pago ADD CONSTRAINT complementos_pago_ingreso_id_fkey
  FOREIGN KEY (ingreso_id) REFERENCES ingresos(id) ON DELETE SET NULL;

ALTER TABLE complementos_pago ADD COLUMN IF NOT EXISTS empresa         text;
ALTER TABLE complementos_pago ADD COLUMN IF NOT EXISTS origen          text NOT NULL DEFAULT 'auto';
ALTER TABLE complementos_pago ADD COLUMN IF NOT EXISTS estatus         text NOT NULL DEFAULT 'vigente';
ALTER TABLE complementos_pago ADD COLUMN IF NOT EXISTS cancelada_at    timestamptz;
ALTER TABLE complementos_pago ADD COLUMN IF NOT EXISTS factura_numero  text;
ALTER TABLE complementos_pago ADD COLUMN IF NOT EXISTS receptor_nombre text;
ALTER TABLE complementos_pago ADD COLUMN IF NOT EXISTS created_by      uuid;

-- Los que ya existen (todos automáticos): datos desde su ingreso
UPDATE complementos_pago c
   SET empresa         = i.empresa,
       factura_numero  = COALESCE(c.factura_numero, i.numero_factura),
       receptor_nombre = COALESCE(c.receptor_nombre, r.razon_social, i.cliente_agencia)
  FROM ingresos i
  LEFT JOIN receptores_fiscales r ON r.id = i.receptor_fiscal_id
 WHERE i.id = c.ingreso_id AND c.empresa IS NULL;

ALTER TABLE complementos_pago ALTER COLUMN empresa SET NOT NULL;

ALTER TABLE complementos_pago DROP CONSTRAINT IF EXISTS complementos_pago_origen_chk;
ALTER TABLE complementos_pago ADD CONSTRAINT complementos_pago_origen_chk CHECK (origen IN ('auto', 'manual'));
ALTER TABLE complementos_pago DROP CONSTRAINT IF EXISTS complementos_pago_estatus_chk;
ALTER TABLE complementos_pago ADD CONSTRAINT complementos_pago_estatus_chk CHECK (estatus IN ('vigente', 'cancelada'));

-- Un complemento automático VIGENTE por línea de ingreso (si se cancela, se
-- puede volver a emitir). Los manuales van sin ingreso_id.
DROP INDEX IF EXISTS complementos_pago_ingreso_uniq;
CREATE UNIQUE INDEX complementos_pago_ingreso_uniq ON complementos_pago(ingreso_id) WHERE estatus = 'vigente';

CREATE INDEX IF NOT EXISTS complementos_pago_created_idx ON complementos_pago(created_at DESC);
