-- Complemento Detallista (tiendas departamentales como Liverpool).
--
-- Datos que se recuerdan por cliente para prellenar el complemento la próxima
-- vez que se le facture:
--   { "activo": bool,            -- la última factura lo llevó
--     "gln_comprador": "0000000148314",
--     "gln_vendedor":  "0000000148314",
--     "num_proveedor": "148314" }
-- El número de pedido (orden de compra) cambia en cada factura, no se guarda.
--
-- Liverpool se prellena con lo que mandaba Orderly (F3778/F3786/F3808).
--
-- Aplicada el 2026-11-19 vía Management API.

ALTER TABLE receptores_fiscales ADD COLUMN IF NOT EXISTS detallista jsonb;

UPDATE receptores_fiscales
   SET detallista = '{"activo": false, "gln_comprador": "0000000148314", "gln_vendedor": "0000000148314", "num_proveedor": "148314"}'::jsonb
 WHERE rfc = 'DLI931201MI9' AND detallista IS NULL;
