-- Activa Realtime para las tablas del calendario
-- Esto permite que los cambios se propaguen instantáneamente a todos los usuarios conectados

alter publication supabase_realtime add table public.shoots;
alter publication supabase_realtime add table public.shoot_employees;
alter publication supabase_realtime add table public.shoot_resources;
alter publication supabase_realtime add table public.vacations;
alter publication supabase_realtime add table public.vacation_employees;
