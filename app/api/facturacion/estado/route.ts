import { NextResponse } from "next/server"
import { verifyApiRole } from "../../../../lib/api-auth"
import { esModoPruebas, facturapiKey } from "../../../../lib/facturapi"

// GET → si cada empresa ya tiene Facturapi conectado y en qué ambiente.
// { retro_studio: "pruebas" | "real" | null, retro_films: … }
export async function GET(req: Request) {
  const user = await verifyApiRole(req, ["admin", "finanzas"])
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const estado = (e: string) => (facturapiKey(e) ? (esModoPruebas(e) ? "pruebas" : "real") : null)
  return NextResponse.json({ retro_studio: estado("retro_studio"), retro_films: estado("retro_films") })
}
