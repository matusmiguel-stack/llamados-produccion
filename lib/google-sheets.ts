// Cliente mínimo de Google Sheets con cuenta de servicio, sin dependencias:
// firma el JWT RS256 con el crypto de Node. Solo para uso en el servidor.
//
// Las cuentas de servicio no tienen cuota de almacenamiento en Drive, así que
// NO pueden crear archivos ("storage quota has been exceeded"). Por eso la app
// escribe pestañas dentro de UNA hoja de cálculo ya existente, creada por un
// humano y compartida con la cuenta de servicio (env GOOGLE_REFERENCIAS_SPREADSHEET_ID).
import crypto from "crypto"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

export function googleDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
    process.env.GOOGLE_REFERENCIAS_SPREADSHEET_ID
  )
}

export const referenciasSpreadsheetId = () => process.env.GOOGLE_REFERENCIAS_SPREADSHEET_ID!

export async function getGoogleAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!
  // La clave llega con \n escapados cuando se pega como env var
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n")

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({
    iss: email,
    scope: SCOPES.join(" "),
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })).toString("base64url")

  const signer = crypto.createSign("RSA-SHA256")
  signer.update(`${header}.${payload}`)
  const signature = signer.sign(key).toString("base64url")
  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`Google auth falló: ${data.error_description || data.error || res.status}`)
  }
  return data.access_token
}

type Tab = { sheetId: number; title: string }

async function sheetsFetch(token: string, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error?.message || `HTTP ${res.status}`
    if (res.status === 404) {
      throw new Error("No se encontró la hoja de cálculo. Verifica GOOGLE_REFERENCIAS_SPREADSHEET_ID y que esté compartida con la cuenta de servicio.")
    }
    if (res.status === 403) {
      throw new Error(`Sin permiso para escribir en la hoja. Compártela (o su carpeta) con la cuenta de servicio como Editor. Detalle: ${msg}`)
    }
    throw new Error(msg)
  }
  return data
}

// Título de pestaña válido: sin caracteres prohibidos y máx. 90 caracteres.
export function sanitizeTabTitle(name: string): string {
  const clean = name.replace(/[\[\]\*\/\\\?:]/g, " ").replace(/\s+/g, " ").trim()
  return (clean || "Proyecto").slice(0, 90)
}

export async function getTabs(token: string, spreadsheetId: string): Promise<Tab[]> {
  const data = await sheetsFetch(token, `${spreadsheetId}?fields=sheets.properties(sheetId,title)`)
  return (data.sheets || []).map((s: any) => ({ sheetId: s.properties.sheetId, title: s.properties.title }))
}

function uniqueTitle(base: string, existing: Tab[]): string {
  const taken = new Set(existing.map(t => t.title.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; i < 100; i++) {
    const candidate = `${base} (${i})`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return `${base} ${Date.now()}`
}

// Crea la pestaña del proyecto y devuelve su gid.
export async function addTab(token: string, spreadsheetId: string, title: string, existing: Tab[]): Promise<Tab> {
  const finalTitle = uniqueTitle(title, existing)
  const data = await sheetsFetch(token, `${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: finalTitle } } }] }),
  })
  const props = data.replies?.[0]?.addSheet?.properties
  return { sheetId: props.sheetId, title: props.title }
}

export async function renameTab(token: string, spreadsheetId: string, tab: Tab, title: string, existing: Tab[]): Promise<Tab> {
  const finalTitle = uniqueTitle(title, existing.filter(t => t.sheetId !== tab.sheetId))
  await sheetsFetch(token, `${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: tab.sheetId, title: finalTitle },
          fields: "title",
        },
      }],
    }),
  })
  return { ...tab, title: finalTitle }
}

// Reemplaza todo el contenido de la pestaña con las filas dadas.
export async function overwriteTab(token: string, spreadsheetId: string, tab: Tab, rows: (string | number)[][]): Promise<void> {
  // Rango A1 con el título entre comillas simples (las internas se duplican)
  const range = encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'!A1:Z100000`)
  await sheetsFetch(token, `${spreadsheetId}/values/${range}:clear`, { method: "POST" })
  await sheetsFetch(token, `${spreadsheetId}/values/${encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'!A1`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: rows }),
  })

  // Formato: encabezado en negritas y congelado + columnas ajustadas.
  // Si falla no pasa nada, los datos ya quedaron.
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId: tab.sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId: tab.sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 6 },
          },
        },
      ],
    }),
  }).catch(() => {})
}

export const tabUrl = (spreadsheetId: string, gid: number) =>
  `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`
