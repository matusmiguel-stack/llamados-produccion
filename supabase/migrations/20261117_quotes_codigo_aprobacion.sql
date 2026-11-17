-- Código propio por cotización aprobada.
--
-- Un proyecto puede tener varias cotizaciones aprobadas: la primera usa el
-- código del proyecto (RS3007) y las siguientes uno consecutivo (RS3007-1,
-- RS3007-2…). Cada una lleva su control de egresos independiente: sus gastos,
-- instrucciones de facturación, facturas de proveedores y reportes van con su
-- propio código, empresa y responsable.
--
--   codigo         código con el que se aprobó (null = cotización vieja o no
--                  aprobada → se usa projects.code)
--   codigo_nombre  nombre de la línea en Ingresos ("Resizing")
--   empresa        empresa a la que se factura esa aprobación
--   responsable    responsable de esa aprobación
--
-- Aplicada el 2026-11-17 vía Management API.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS codigo_nombre text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS empresa text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS responsable text;

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_empresa_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_empresa_check
  CHECK (empresa IS NULL OR empresa IN ('retro_studio', 'retro_films'));

-- Un sub-código (RS3007-1) pertenece a una sola cotización.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_subcodigo_key ON quotes (codigo) WHERE codigo LIKE '%-%';

-- El portal de facturas busca la cotización por su código.
CREATE INDEX IF NOT EXISTS quotes_codigo_idx ON quotes (codigo) WHERE codigo IS NOT NULL;
