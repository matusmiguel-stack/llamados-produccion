-- Agrega campo de entregables a la cotización
alter table public.quotes
  add column if not exists entregables text;
