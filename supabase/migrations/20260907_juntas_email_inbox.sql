-- Juntas creadas automáticamente desde un correo copiado a la casilla de
-- invitaciones (ver /api/correo-entrante/webhook). Se guardan como una junta
-- más, sin proyecto, para que cualquiera las reclasifique o edite a mano.
--
-- Aplicada el 2026-09-07 vía Management API.

ALTER TABLE juntas DROP CONSTRAINT IF EXISTS juntas_tipo_check;
ALTER TABLE juntas ADD CONSTRAINT juntas_tipo_check
  CHECK (tipo IN ('Brief', 'PPM', 'Junta Cliente', 'Junta Interna', 'Invitación por correo'));

-- Id del correo en Resend, para no duplicar la junta si el webhook reintenta.
ALTER TABLE juntas ADD COLUMN IF NOT EXISTS email_id text;
CREATE UNIQUE INDEX IF NOT EXISTS juntas_email_id_key ON juntas (email_id) WHERE email_id IS NOT NULL;
