-- Complementos de pago (CFDI tipo P) de facturas PPD, emitidos desde la app
-- al marcar un ingreso como pagado. Una fila por línea de ingreso pagada; la
-- parcialidad y el saldo anterior se calculan con los complementos previos de
-- la misma factura (factura_uuid).
--
-- Aplicada el 2026-10-27 vía Management API.

CREATE TABLE IF NOT EXISTS complementos_pago (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingreso_id      uuid NOT NULL REFERENCES ingresos(id) ON DELETE CASCADE,
  factura_uuid    text NOT NULL,          -- factura PPD que se está pagando
  facturapi_id    text NOT NULL,
  uuid            text,                   -- folio fiscal del complemento
  numero          text,                   -- serie + folio del complemento
  monto           numeric NOT NULL,       -- importe pagado (con IVA)
  parcialidad     int NOT NULL,
  saldo_anterior  numeric NOT NULL,
  fecha_pago      date NOT NULL,
  forma_pago      text NOT NULL,
  xml_path        text,
  pdf_path        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS complementos_pago_ingreso_uniq ON complementos_pago(ingreso_id);
CREATE INDEX IF NOT EXISTS complementos_pago_factura_idx ON complementos_pago(factura_uuid);

ALTER TABLE complementos_pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finanzas lee complementos" ON complementos_pago;
CREATE POLICY "Finanzas lee complementos" ON complementos_pago FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','finanzas')));
