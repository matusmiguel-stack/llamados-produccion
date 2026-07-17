-- Marcar un ingreso como facturado ahora exige el PDF y el XML del CFDI, y el
-- número de factura se lee del propio XML (Serie + Folio, p. ej. "F3777").
--
-- También se elimina el estatus 'proceso_facturado': no lo usaba ningún
-- ingreso (0 filas) y se confundía con 'facturado'.
--
-- Aplicada el 2026-07-16 vía Management API.

ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS factura_pdf_path text;
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS factura_xml_path text;
-- Folio fiscal (UUID del TimbreFiscalDigital), para detectar duplicados
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS factura_uuid text;

ALTER TABLE ingresos DROP CONSTRAINT IF EXISTS ingresos_estatus_check;
ALTER TABLE ingresos ADD CONSTRAINT ingresos_estatus_check
  CHECK (estatus = ANY (ARRAY['en_produccion','facturado','por_cobrar','factorado','pagado']));
