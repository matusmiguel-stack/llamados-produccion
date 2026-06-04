alter table public.entregas
  add column if not exists project_id uuid references public.projects(id) on delete set null;
