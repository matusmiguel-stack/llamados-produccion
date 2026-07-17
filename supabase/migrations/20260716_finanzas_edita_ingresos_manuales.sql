-- Finanzas no podía guardar cambios en ingresos MANUALES.
--
-- El trigger revertía empresa/cliente/responsable/proyecto/subtotal/iva para el
-- rol finanzas en TODOS los ingresos. Eso contradice las políticas de
-- INSERT/DELETE, que sí le permiten crear y borrar los manuales (project_id IS
-- NULL): podía crear un ingreso manual pero no corregirlo nunca. El UPDATE no
-- daba error — el trigger revertía los campos en silencio y el pop up cerraba
-- como si hubiera guardado.
--
-- Ahora el bloqueo aplica solo a los ingresos LIGADOS, donde los datos los
-- dicta la cotización aprobada. project_id/quote_id siguen bloqueados siempre
-- para que finanzas no pueda re-ligar un ingreso.
--
-- Aplicada el 2026-07-16 vía Management API.

CREATE OR REPLACE FUNCTION public.enforce_finanzas_ingresos_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE r text;
BEGIN
  SELECT role INTO r FROM profiles WHERE id = auth.uid();
  IF r = 'finanzas' THEN
    -- Finanzas nunca re-liga un ingreso a otro proyecto/cotizacion.
    NEW.project_id := OLD.project_id;
    NEW.quote_id   := OLD.quote_id;
    -- En ingresos LIGADOS estos datos los dicta la cotizacion aprobada.
    -- En los MANUALES finanzas captura y corrige todo.
    IF OLD.project_id IS NOT NULL THEN
      NEW.empresa         := OLD.empresa;
      NEW.cliente_agencia := OLD.cliente_agencia;
      NEW.responsable     := OLD.responsable;
      NEW.proyecto        := OLD.proyecto;
      NEW.subtotal        := OLD.subtotal;
      NEW.iva             := OLD.iva;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
