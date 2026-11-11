-- Borrar usuarios: no se podía borrar a nadie que hubiera creado algo.
--
-- Qué pasaba (11-nov-2026): 19 de 31 usuarios no se podían eliminar desde
-- Usuarios. Las columnas "created_by" de clients, projects, quotes, shoots,
-- juntas, entregas y ensayos apuntan a auth.users sin regla de borrado (NO
-- ACTION), igual que user_tasks.completed_by hacia profiles, así que la BD
-- rechazaba el borrado de cualquiera que hubiera creado una cotización, una
-- entrega, una junta… o completado una tarea. Además la ruta borraba primero
-- el perfil y luego la cuenta: si fallaba la segunda, quedaba a medias.
--
-- Ahora:
--  * Al borrar al usuario esas columnas quedan vacías (ON DELETE SET NULL);
--    los registros se conservan y el historial de actividad guarda quién era.
--  * profiles.id → auth.users con ON DELETE CASCADE: borrar la cuenta borra su
--    perfil en la misma operación (todo o nada).
--
-- Aplicada el 2026-11-11 vía Management API.

ALTER TABLE clients  DROP CONSTRAINT IF EXISTS clients_created_by_fkey;
ALTER TABLE clients  ADD  CONSTRAINT clients_created_by_fkey  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_created_by_fkey;
ALTER TABLE projects ADD  CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE quotes   DROP CONSTRAINT IF EXISTS quotes_created_by_fkey;
ALTER TABLE quotes   ADD  CONSTRAINT quotes_created_by_fkey   FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE shoots   DROP CONSTRAINT IF EXISTS shoots_created_by_fkey;
ALTER TABLE shoots   ADD  CONSTRAINT shoots_created_by_fkey   FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE juntas   DROP CONSTRAINT IF EXISTS juntas_created_by_fkey;
ALTER TABLE juntas   ADD  CONSTRAINT juntas_created_by_fkey   FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE entregas DROP CONSTRAINT IF EXISTS entregas_created_by_fkey;
ALTER TABLE entregas ADD  CONSTRAINT entregas_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ensayos  DROP CONSTRAINT IF EXISTS ensayos_created_by_fkey;
ALTER TABLE ensayos  ADD  CONSTRAINT ensayos_created_by_fkey  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE user_tasks DROP CONSTRAINT IF EXISTS user_tasks_completed_by_fkey;
ALTER TABLE user_tasks ADD  CONSTRAINT user_tasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles ADD  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
