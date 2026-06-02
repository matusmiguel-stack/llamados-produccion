-- Eliminar el trigger que asignaba el código al crear el proyecto.
-- El código RS#### ahora se asigna solo al aprobar la cotización (desde el frontend).
drop trigger if exists trg_project_code on public.projects;
