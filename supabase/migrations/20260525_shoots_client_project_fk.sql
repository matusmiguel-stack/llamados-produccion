-- Vincula llamados con el catálogo de clientes/proyectos.
-- Ejecuta después de 20260525_create_clients_projects.sql

alter table public.shoots
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- Importa clientes existentes desde texto libre en shoots
insert into public.clients (name)
select distinct trim(client)
from public.shoots
where client is not null
  and trim(client) <> ''
on conflict (name) do nothing;

-- Importa proyectos existentes cuando hay cliente coincidente
insert into public.projects (client_id, name)
select distinct c.id, trim(s.project)
from public.shoots s
join public.clients c on c.name = trim(s.client)
where s.project is not null
  and trim(s.project) <> ''
on conflict (client_id, name) do nothing;

update public.shoots s
set client_id = c.id
from public.clients c
where s.client_id is null
  and s.client is not null
  and trim(s.client) <> ''
  and c.name = trim(s.client);

update public.shoots s
set project_id = p.id
from public.projects p
where s.project_id is null
  and s.project is not null
  and trim(s.project) <> ''
  and s.client_id = p.client_id
  and p.name = trim(s.project);
