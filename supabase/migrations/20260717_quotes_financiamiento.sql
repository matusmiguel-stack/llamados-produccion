-- Rubro global "Financiamiento": porcentaje sobre toda la cotización, igual
-- que el markup visible. En los totales se suman ambos (o el que tenga valor).
-- Aplicada el 2026-07-17 vía Management API.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS financiamiento_percentage numeric NOT NULL DEFAULT 0;
