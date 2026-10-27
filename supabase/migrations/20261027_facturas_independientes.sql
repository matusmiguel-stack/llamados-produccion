-- Facturas "independientes": timbradas desde la app sin ligarse al control de
-- ingresos (casi siempre préstamos entre Retro Studio y Retro Films), así que
-- no suman a los totales de Ingresos. Se escriben solo desde el servidor.
--
-- Aplicada el 2026-10-27 vía Management API.

CREATE TABLE IF NOT EXISTS facturas_independientes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa            text NOT NULL,          -- quien emite: retro_studio | retro_films
  receptor_fiscal_id uuid REFERENCES receptores_fiscales(id) ON DELETE SET NULL,
  receptor_rfc       text NOT NULL,
  receptor_nombre    text NOT NULL,
  conceptos          jsonb NOT NULL,         -- [{descripcion, clave_prod_serv, clave_unidad, subtotal}]
  subtotal           numeric NOT NULL,
  iva                numeric NOT NULL,
  total              numeric NOT NULL,
  metodo_pago        text NOT NULL,
  forma_pago         text NOT NULL,
  uso_cfdi           text NOT NULL,
  notas              text,
  facturapi_id       text NOT NULL UNIQUE,
  uuid               text,
  numero             text,
  xml_path           text,
  pdf_path           text,
  estatus            text NOT NULL DEFAULT 'vigente',  -- vigente | cancelada
  cancelada_at       timestamptz,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facturas_independientes_created_idx ON facturas_independientes(created_at DESC);

ALTER TABLE facturas_independientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finanzas lee facturas independientes" ON facturas_independientes;
CREATE POLICY "Finanzas lee facturas independientes" ON facturas_independientes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','finanzas')));
