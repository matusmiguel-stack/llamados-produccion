-- ingresos.cliente_agencia es una copia de texto del nombre del cliente
-- (clients.name, la "carpeta" en Proyectos) que se hacía al crear el ingreso y
-- nunca se actualizaba: renombrar el cliente en Proyectos dejaba el nombre
-- viejo en Ingresos. Estos triggers lo mantienen sincronizado.

-- 1) Renombrar el cliente → actualizar los ingresos de todos sus proyectos.
CREATE OR REPLACE FUNCTION trg_clients_sync_ingresos() RETURNS trigger AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE ingresos i
       SET cliente_agencia = NEW.name, updated_at = now()
      FROM projects p
     WHERE p.id = i.project_id
       AND p.client_id = NEW.id
       AND i.cliente_agencia IS DISTINCT FROM NEW.name;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS clients_sync_ingresos ON clients;
CREATE TRIGGER clients_sync_ingresos
  AFTER UPDATE OF name ON clients
  FOR EACH ROW EXECUTE FUNCTION trg_clients_sync_ingresos();

-- 2) Mover un proyecto a otra carpeta/cliente → actualizar sus ingresos.
CREATE OR REPLACE FUNCTION trg_projects_sync_ingresos_cliente() RETURNS trigger AS $$
DECLARE v_name text;
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id AND NEW.client_id IS NOT NULL THEN
    SELECT name INTO v_name FROM clients WHERE id = NEW.client_id;
    IF v_name IS NOT NULL THEN
      UPDATE ingresos
         SET cliente_agencia = v_name, updated_at = now()
       WHERE project_id = NEW.id
         AND cliente_agencia IS DISTINCT FROM v_name;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS projects_sync_ingresos_cliente ON projects;
CREATE TRIGGER projects_sync_ingresos_cliente
  AFTER UPDATE OF client_id ON projects
  FOR EACH ROW EXECUTE FUNCTION trg_projects_sync_ingresos_cliente();

-- 3) Backfill: corregir los ingresos ligados que quedaron con nombre viejo.
UPDATE ingresos i
   SET cliente_agencia = c.name, updated_at = now()
  FROM projects p
  JOIN clients c ON c.id = p.client_id
 WHERE p.id = i.project_id
   AND i.cliente_agencia IS DISTINCT FROM c.name;
