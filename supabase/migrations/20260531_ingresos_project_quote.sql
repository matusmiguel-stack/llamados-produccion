-- Vincula cada ingreso con su proyecto y cotización de origen
-- para poder evitar aprobar el mismo proyecto dos veces
alter table public.ingresos
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists quote_id   uuid references public.quotes(id)   on delete set null;
