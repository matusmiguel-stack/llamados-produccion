-- En la liberación se ocultan los rubros/ítems que quedaron en cero al cotizar
-- (como en el PDF). Para no alterar las cotizaciones que YA estaban liberadas
-- antes de introducir esto, se exentan con este flag (false = mostrar todo).
-- Las nuevas cotizaciones nacen con el flag en true (ocultar vacíos).
alter table public.quotes
  add column if not exists liberacion_oculta_ceros boolean not null default true;

-- Backfill one-time: exentar las 11 cotizaciones ya liberadas a esta fecha.
-- Se listan por id (idempotente: re-ejecutar no afecta a otras).
update public.quotes set liberacion_oculta_ceros = false
where id in (
  '98ef924e-d1ca-4f64-98c0-3ffa0c7897e9', -- RS3008 Fan Fest Zócalo GNP
  '3c543555-8521-4901-add4-a2d3c506c073', -- RS3005 Recetas junio
  '9368826a-03a8-4f45-bfb1-5463c7b5079b', -- RS3006 Promo Requiem
  '9873bfb6-aaac-4836-94cf-602ded951666', -- RS3007 Banamex Branding V02
  '52270fb1-519a-4824-90f4-0763baa936c8', -- RS3009 Recap Jugamos de Local
  '42fc60e2-cae8-4de7-88bc-f0ca5633af8c', -- RS3004 La Porra Imposible Documental
  '00658a82-158f-47e1-8139-c614a3282228', -- RS3003 Adicionales Porra Imposible
  '92eb851e-26a1-4056-910a-eea05c24b621', -- RS3002 AON_Hogar_2026
  '37b07fa4-2a88-4e66-9668-052a044069ec', -- RS3001 Shooting Tena
  '5b88cd05-018c-4d02-be9b-42dee7bab29e', -- RS3000 Kueski Junio V01
  '160ad704-ee68-4fd5-8ced-ef92296a5a15'  -- Video Corporativo Minsa
);
