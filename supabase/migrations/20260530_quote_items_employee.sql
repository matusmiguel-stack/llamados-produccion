-- Permite asignar un empleado interno (en lugar de proveedor externo) a un ítem de cotización
alter table public.quote_items
  add column if not exists actual_employee_id uuid references public.employees(id);
