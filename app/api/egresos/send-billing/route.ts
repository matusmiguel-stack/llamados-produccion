import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"

const FROM = "Retro Casa Productora <news@retrocasaproductora.com>"

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const EMPRESA_INFO: Record<string, { name: string; rfc: string; direccion: string }> = {
  retro_studio: {
    name: "Retro Studio S.A. de C.V.",
    rfc: "RST000000XXX",   // ← actualizar con RFC real
    direccion: "Ciudad de México, México",
  },
  retro_films: {
    name: "Retro Films S.A. de C.V.",
    rfc: "RFI000000XXX",   // ← actualizar con RFC real
    direccion: "Ciudad de México, México",
  },
}

function buildHtml(params: {
  proveedorNombre: string
  proveedorConcepto: string  // "Actividad — Nombre/Empresa"
  montoStr: string           // monto sin IVA formateado
  proyectoLabel: string
  proyectoCodigo: string
  empresaLabel: string
  empresaRfc: string
  empresaDireccion: string
}) {
  const { proveedorNombre, proveedorConcepto, montoStr, proyectoLabel, proyectoCodigo, empresaLabel, empresaRfc, empresaDireccion } = params

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Retro Casa Productora</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#f1f5f9;">Instrucciones de Facturación</p>
          </td>
        </tr>

        <!-- Saludo -->
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:15px;color:#334155;">Hola <strong>${proveedorNombre}</strong>,</p>
            <p style="margin:12px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
              A continuación encontrarás los datos para emitir tu factura:
            </p>
          </td>
        </tr>

        <!-- Código y concepto -->
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Código de Proyecto</p>
                  <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:0.3px;">${proyectoCodigo}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:#64748b;">${proyectoLabel}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Concepto</p>
                  <p style="margin:6px 0 0;font-size:14px;color:#1e293b;line-height:1.6;">${proveedorConcepto}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Monto a facturar</p>
                  <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#0f172a;font-family:monospace;">${montoStr} <span style="font-size:12px;font-weight:400;color:#64748b;">sin IVA</span></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Datos de facturación -->
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Facturar a nombre de</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">Razón social</p>
                  <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${empresaLabel}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">RFC</p>
                  <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${empresaRfc}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">Domicilio fiscal</p>
                  <p style="margin:3px 0 0;font-size:14px;color:#1e293b;">${empresaDireccion}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Instrucciones -->
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Instrucciones para facturar</p>
            <div style="padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
              <p style="margin:0;font-size:13px;color:#334155;line-height:1.7;">
                A continuación, te hacemos llegar el proceso de facturación y pagos que se llevará a cabo a partir de ahora.
              </p>
              <ol style="margin:12px 0 0;padding-left:20px;font-size:13px;color:#334155;line-height:1.8;">
                <li>En el concepto de la factura se deberá agregar la clave del proyecto (información en este correo).</li>
                <li>Describir el servicio ofrecido a dicho proyecto.</li>
                <li>La cantidad de la factura antes de IVA exactamente como la aprobó el productor al realizar la negociación.</li>
                <li>Todos los requisitos del SAT claros.</li>
              </ol>
              <p style="margin:14px 0 0;font-size:13px;color:#334155;line-height:1.7;">
                Las facturas se deberán subir a la página
                <a href="https://llamados-produccion.vercel.app/facturas" style="color:#0ea5e9;text-decoration:none;font-weight:600;">llamados-produccion.vercel.app/facturas</a>
                los días <strong>jueves</strong> de cada semana. En caso de que falte algún dato antes mencionado recibirás un correo automático con la causa por la cual fue rechazada para que se vuelva a ingresar.
              </p>
              <p style="margin:12px 0 0;font-size:13px;color:#334155;line-height:1.7;">
                El sistema mandará automáticamente la confirmación de la factura junto con la fecha estimada de pago.
              </p>
            </div>
          </td>
        </tr>

        <!-- Fechas de pago -->
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Fechas estimadas de pago</p>
            <div style="padding:18px 20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
              <ol style="margin:0;padding-left:20px;font-size:13px;color:#78350f;line-height:1.8;">
                <li style="margin-bottom:10px;">Facturas menores a 10 mil pesos con IVA incluido se pagarán a los próximos <strong>30 días naturales</strong>. En la factura especificar que se realizará pago en parcialidades o definido (PPD). En este caso, el proveedor tendrá que mandar el complemento de pago (CFDI), el cual tendrá que contener el folio fiscal (UUID).</li>
                <li style="margin-bottom:10px;">Facturas de 10 mil pesos a 30 mil pesos con IVA incluido se pagarán a los próximos <strong>60 días naturales</strong>. En la factura especificar que se realizará pago en parcialidades o definido (PPD). En este caso, el proveedor tendrá que mandar el complemento de pago (CFDI), el cual tendrá que contener el folio fiscal (UUID).</li>
                <li>Facturas de más de 30 mil pesos con IVA incluido se pagarán en los próximos <strong>75 días naturales</strong>. En la factura especificar que se realizará pago en parcialidades o definido (PPD). En este caso, el proveedor tendrá que mandar el complemento de pago (CFDI), el cual tendrá que contener el folio fiscal (UUID).</li>
              </ol>
              <p style="margin:14px 0 0;font-size:12px;color:#92400e;line-height:1.7;">
                *Si hay una forma distinta de pago por la naturaleza del proyecto se verá directamente con el proveedor.
              </p>
              <p style="margin:10px 0 0;font-size:12px;font-weight:700;color:#92400e;line-height:1.7;">
                *NO SE PODRÁ TERCERIZAR FACTURAS, DEBERÁ SER RECIBO O FACTURA A NOMBRE DEL PROVEEDOR O NOMBRE DE LA EMPRESA QUE DÉ EL SERVICIO.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
              Si tienes alguna duda, escribe a <a href="mailto:finanzas@retrocasaproductora.com" style="color:#0ea5e9;text-decoration:none;">finanzas@retrocasaproductora.com</a> o al productor del proyecto.
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">— Retro Casa Productora</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { proveedorId, items, proyectoLabel, empresa, responsableNombre } = await req.json()
    // items: [{ monto: string }]  — monto ya formateado, sin IVA

    if (!proveedorId || !items?.length) {
      return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 })
    }

    const admin = createAdminClient()

    // Datos del proveedor (incluye actividad)
    const { data: prov, error: provErr } = await admin
      .from("proveedores")
      .select("nombre, apellido, empresa, actividad, email")
      .eq("id", proveedorId)
      .single()
    if (provErr || !prov) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 })
    if (!prov.email) return NextResponse.json({ error: "El proveedor no tiene email registrado" }, { status: 400 })

    // CC al responsable — buscar email por nombre (flexible: con y sin apellido materno)
    let ccEmail: string | null = null
    if (responsableNombre) {
      const { data: empRows } = await admin
        .from("employees")
        .select("email, nombre, apellido_paterno, apellido_materno")
      const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      const target = norm(responsableNombre)
      console.log("[billing-cc] responsableNombre:", responsableNombre, "→ normalized:", target)
      console.log("[billing-cc] employees:", (empRows || []).map((e: any) => {
        const full3 = norm([e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" "))
        return { full3, email: e.email }
      }))
      const match = (empRows || []).find((e: any) => {
        const full3 = norm([e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" "))
        const full2 = norm([e.nombre, e.apellido_paterno].filter(Boolean).join(" "))
        return full3 === target || full2 === target
      })
      ccEmail = match?.email ?? null
      console.log("[billing-cc] matched:", match ? `${match.nombre} → ${match.email}` : "NONE")
    } else {
      console.log("[billing-cc] no responsableNombre received")
    }

    const nombreLabel = prov.empresa
      ? `${prov.empresa} — ${prov.nombre} ${prov.apellido}`
      : `${prov.nombre} ${prov.apellido}`
    const saludoNombre = prov.empresa || `${prov.nombre} ${prov.apellido}`
    const actividad = prov.actividad || "Servicios"
    const proveedorConcepto = `${actividad} — ${nombreLabel}`
    const montoStr = items.map((it: any) => it.monto).join(" + ")

    // Separar código del nombre del proyecto para mostrarlos en dos líneas
    // proyectoLabel puede ser "RS3000 Kueski Junio" o sólo "Kueski Junio"
    const codeMatch = proyectoLabel.match(/^(RS\d+)\s+(.+)$/)
    const proyectoCodigo = codeMatch ? codeMatch[1] : "—"
    const proyectoNombre = codeMatch ? codeMatch[2] : proyectoLabel

    const empresaInfo = EMPRESA_INFO[empresa] || EMPRESA_INFO.retro_studio

    const html = buildHtml({
      proveedorNombre: saludoNombre,
      proveedorConcepto,
      montoStr,
      proyectoLabel: proyectoNombre,
      proyectoCodigo,
      empresaLabel: empresaInfo.name,
      empresaRfc: empresaInfo.rfc,
      empresaDireccion: empresaInfo.direccion,
    })

    const resend = getResend()
    const { error: sendErr } = await resend.emails.send({
      from: FROM,
      to: prov.email,
      ...(ccEmail ? { cc: ccEmail } : {}),
      subject: `Datos de facturación — ${proyectoLabel}`,
      html,
    })

    if (sendErr) return NextResponse.json({ error: sendErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, sentTo: prov.email, cc: ccEmail })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
