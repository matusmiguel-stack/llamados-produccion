-- Pago parcial desde Ingresos: el monto de la línea pagada SÍ debe bajar.
--
-- Qué pasaba (RS3054 Un Hijo Para Navidad 29-oct, RS3026 Convención Modelo
-- 30-oct, ambos por usuarios finanzas): al marcar un pago parcial, la app
-- reduce el subtotal/IVA de la línea original a lo cobrado y crea la línea
-- "… - Liquidación" con el resto. Pero enforce_finanzas_ingresos_lock revertía
-- en silencio subtotal/iva en los ingresos ligados a proyecto para el rol
-- finanzas, así que la original quedaba "pagada" con el monto COMPLETO y el
-- remanente aparte: el cobrado se inflaba por lo que faltaba. Con admin sí
-- funcionaba (RS3021, 3-ago).
--
-- 1) El candado de finanzas deja bajar subtotal/iva justo al marcar el pago
--    (pago parcial o pago sin IVA). Todo lo demás sigue bloqueado.
-- 2) sync_ingreso_from_quote (el ingreso sigue a su cotización) ya solo toca
--    ingresos EN PRODUCCIÓN y sin remanente: un monto ya facturado o cobrado
--    es un hecho y no debe cambiar porque alguien edite la cotización o el
--    control de egresos (ambos disparan el sync). Sin esto, el pago parcial
--    se deshacía con el siguiente cambio en los rubros; y así se reescribió el
--    ingreso facturado de RS3010 (26-oct) y el pagado de RS3002 (21-ago).
--
-- Aplicada el 2026-10-30 vía Management API.

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
      -- Al marcar el pago sí puede BAJAR el monto: pago parcial (la línea se
      -- queda con lo cobrado y el resto va a "… - Liquidación") o pago sin IVA.
      IF NOT (NEW.estatus = 'pagado' AND OLD.estatus IS DISTINCT FROM 'pagado'
              AND NEW.subtotal <= OLD.subtotal AND NEW.iva <= OLD.iva) THEN
        NEW.subtotal := OLD.subtotal;
        NEW.iva      := OLD.iva;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_ingreso_from_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_venta numeric;
  v_markup numeric;
  v_subtotal numeric;
BEGIN
  IF p_quote_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM ingresos WHERE quote_id = p_quote_id) THEN RETURN; END IF;

  SELECT coalesce(sum(qi.qty * qi.days * qi.unit_price * (1 + coalesce(qi.released_expense,0)/100.0)), 0)
    INTO v_venta
    FROM quote_items qi
    JOIN quote_sections qs ON qs.id = qi.section_id
    WHERE qs.quote_id = p_quote_id;

  SELECT coalesce(markup_percentage, 0) INTO v_markup FROM quotes WHERE id = p_quote_id;

  v_subtotal := round((v_venta * (1 + v_markup/100.0))::numeric, 2);

  UPDATE ingresos i
     SET subtotal = v_subtotal,
         iva = round((v_subtotal * 0.16)::numeric, 2),
         updated_at = now()
   WHERE i.quote_id = p_quote_id
     -- Solo mientras el ingreso sigue en producción: facturado o cobrado, el
     -- monto ya es un hecho (CFDI / dinero recibido) y no sigue a la cotización.
     AND i.estatus = 'en_produccion'
     -- Ni cuando ya se partió (factura o pago parcial): el total vive en dos líneas.
     AND NOT EXISTS (
       SELECT 1 FROM ingresos r
        WHERE r.liquidacion_project_id = i.project_id AND r.notas LIKE 'Remanente%'
     )
     AND (i.subtotal IS DISTINCT FROM v_subtotal);  -- evitar escrituras/loops innecesarios
END;
$function$;
