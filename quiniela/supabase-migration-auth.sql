-- Migración: agregar autenticación a jugadores

-- 1. Agregar columna user_id
alter table jugadores add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Hacer user_id único (un usuario = un grupo)
alter table jugadores add constraint jugadores_user_id_unique unique (user_id);

-- 3. Eliminar el unique anterior de nombre+grupo (ya no se usa)
alter table jugadores drop constraint if exists jugadores_nombre_grupo_id_key;

-- 4. Índice para lookup por user_id
create index if not exists jugadores_user_id_idx on jugadores(user_id);
