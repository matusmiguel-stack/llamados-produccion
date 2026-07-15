-- Dirección física y liga de Google Maps para las juntas.
-- Aplicada el 2026-07-15 vía Management API.

ALTER TABLE juntas ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE juntas ADD COLUMN IF NOT EXISTS maps_link text;
