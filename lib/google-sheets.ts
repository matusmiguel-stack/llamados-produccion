// Cliente mínimo de Google Sheets/Drive con cuenta de servicio, sin
// dependencias: firma el JWT RS256 con el crypto de Node.
// Solo para uso en el servidor (API routes).
import crypto from "crypto"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
]

export function googleDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
    process.env.GOOGLE_DRIVE_REFERENCIAS_FOLDER_ID
  )
}

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

// Crea una hoja de cálculo dentro de la carpeta compartida. Devuelve su id.
export async function createSpreadsheetInFolder(token: string, name: string): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_REFERENCIAS_FOLDER_ID!
  const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.id) {
    throw new Error(`No se pudo crear la hoja en Drive: ${data.error?.message || res.status}`)
  }
  return data.id
}

// Renombra el archivo en Drive (por si el proyecto cambió de nombre).
export async function renameDriveFile(token: string, fileId: string, name: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).catch(() => {})
}

// Reemplaza todo el contenido de la primera pestaña con las filas dadas.
// Devuelve false si la hoja ya no existe en Drive (404) para poder recrearla.
export async function overwriteSheet(token: string, spreadsheetId: string, rows: (string | number)[][]): Promise<boolean> {
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z100000:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  )
  if (clearRes.status === 404) return false
  if (!clearRes.ok) {
    const err = await clearRes.json().catch(() => ({}))
    throw new Error(`No se pudo limpiar la hoja: ${err.error?.message || clearRes.status}`)
  }

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows }),
    }
  )
  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}))
    throw new Error(`No se pudo escribir la hoja: ${err.error?.message || updateRes.status}`)
  }

  // Formato: encabezado en negritas y congelado + columnas ajustadas.
  // Si falla no pasa nada, los datos ya quedaron.
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 6 },
          },
        },
      ],
    }),
  }).catch(() => {})

  return true
}

export const spreadsheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}`
