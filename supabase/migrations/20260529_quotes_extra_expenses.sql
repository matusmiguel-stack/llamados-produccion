-- Agrega campo para gastos reales no contemplados en la liberación
alter table public.quotes
  add column if not exists actual_extra_expenses numeric not null default 0;
