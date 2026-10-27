-- Facturación desde la app (timbrado vía Facturapi).
--
-- receptores_fiscales: datos fiscales de a quién se le factura. Va aparte de
-- clients porque el cliente del proyecto no siempre es la razón social que
-- recibe la factura (agencias, marcas con varias razones sociales…).
--
-- emisores_fiscales: los datos de Retro Studio / Retro Films y sus valores por
-- omisión al facturar (serie, clave SAT del concepto, unidad…). Se llenan al
-- importar las facturas que ya se subieron desde Orderly.
--
-- Aplicada el 2026-10-27 vía Management API.

CREATE TABLE IF NOT EXISTS receptores_fiscales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfc             text NOT NULL UNIQUE,
  razon_social    text NOT NULL,
  regimen_fiscal  text NOT NULL,          -- catálogo SAT c_RegimenFiscal (601, 612…)
  cp              text NOT NULL,          -- código postal del domicilio fiscal
  uso_cfdi        text NOT NULL DEFAULT 'G03',
  email           text,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  -- Últimos valores usados con este receptor (para prellenar la siguiente)
  ultima_forma_pago  text,
  ultimo_metodo_pago text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emisores_fiscales (
  empresa         text PRIMARY KEY,        -- 'retro_studio' | 'retro_films' (= ingresos.empresa)
  rfc             text,
  razon_social    text,
  regimen_fiscal  text,
  cp              text,
  serie           text,
  clave_prod_serv text,
  clave_unidad    text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO emisores_fiscales (empresa) VALUES ('retro_studio'), ('retro_films')
ON CONFLICT DO NOTHING;

-- Ingresos facturados desde la app
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS facturapi_id text;
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS receptor_fiscal_id uuid REFERENCES receptores_fiscales(id) ON DELETE SET NULL;
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS factura_metodo_pago text;

ALTER TABLE receptores_fiscales ENABLE ROW LEVEL SECURITY;
ALTER TABLE emisores_fiscales ENABLE ROW LEVEL SECURITY;

-- Lectura y edición: admin y finanzas (los mismos que facturan)
DROP POLICY IF EXISTS "Finanzas lee receptores" ON receptores_fiscales;
CREATE POLICY "Finanzas lee receptores" ON receptores_fiscales FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','finanzas')));
DROP POLICY IF EXISTS "Finanzas edita receptores" ON receptores_fiscales;
CREATE POLICY "Finanzas edita receptores" ON receptores_fiscales FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','finanzas')))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','finanzas')));

DROP POLICY IF EXISTS "Finanzas lee emisores" ON emisores_fiscales;
CREATE POLICY "Finanzas lee emisores" ON emisores_fiscales FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','finanzas')));
DROP POLICY IF EXISTS "Finanzas edita emisores" ON emisores_fiscales;
CREATE POLICY "Finanzas edita emisores" ON emisores_fiscales FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','finanzas')))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','finanzas')));
