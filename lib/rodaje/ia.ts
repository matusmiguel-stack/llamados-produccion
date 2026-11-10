// Lectura de guiones con IA (Claude). SOLO SERVIDOR: usa ANTHROPIC_API_KEY.
//
// Dos lecturas sobre el mismo archivo:
//   1. leerIndice → qué piezas (guiones/videos/capítulos) trae y qué escenas
//      tiene cada una. Es lo que el usuario revisa antes de armar el plan.
//   2. leerTexto  → el texto de un grupo de escenas, línea por línea, para el
//      botón GUION. Se pide por tandas chicas para que cada llamada sea corta.
//
// Variables de entorno:
//   ANTHROPIC_API_KEY       (obligatoria) llave creada en platform.claude.com
//   ANTHROPIC_WORKSPACE_ID  (opcional)    solo si la llave NO se creó ligada a un
//                                         workspace: id del workspace a usar
//   RODAJE_IA_MODELO        (opcional)    modelo; por defecto claude-sonnet-5-5

import Anthropic from "@anthropic-ai/sdk"
import {
  TIPOS_LINEA,
  type Etiqueta,
  type GuionIA,
  type IndiceIA,
  type LineaGuion,
  type TipoLinea,
  type UsoIA,
} from "./tipos"

const MODELO_POR_DEFECTO = "claude-sonnet-5-5"
// La función de Vercel corta a los 300 s; dejamos margen para guardar el resultado.
const TIEMPO_MAX_MS = 270_000
const MAX_TOKENS_INDICE = 48_000
const MAX_TOKENS_TEXTO = 48_000

export const MIME_PDF = "application/pdf"
export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const MIME_TXT = "text/plain"

export type CodigoErrorIA =
  | "config"     // falta la llave o es inválida
  | "limite"     // demasiadas peticiones o sin saldo
  | "truncado"   // la respuesta no cupo: pedir menos escenas
  | "rechazo"    // el modelo se negó
  | "documento"  // el archivo no se pudo leer o es demasiado largo
  | "tiempo"     // se acabó el tiempo
  | "otro"

export class ErrorIA extends Error {
  codigo: CodigoErrorIA
  status: number
  constructor(mensaje: string, codigo: CodigoErrorIA = "otro", status = 502) {
    super(mensaje)
    this.name = "ErrorIA"
    this.codigo = codigo
    this.status = status
  }
}

export type DocumentoGuion = { nombre: string; mime: string; datos: Buffer }

export function modeloIA(): string {
  return process.env.RODAJE_IA_MODELO?.trim() || MODELO_POR_DEFECTO
}

function cliente(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new ErrorIA(
      "Falta configurar ANTHROPIC_API_KEY en Vercel. Sin esa llave la IA no puede leer guiones.",
      "config",
      503
    )
  }
  // Una llave que no está ligada a un workspace necesita decir cuál usar en
  // cada petición; si la llave ya trae workspace, la variable no hace falta.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  return new Anthropic({
    apiKey,
    maxRetries: 2,
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
  })
}

const SIN_WORKSPACE =
  "La llave de Anthropic no está ligada a un workspace. Crea una llave nueva eligiendo un workspace " +
  "(platform.claude.com/settings/keys) o define ANTHROPIC_WORKSPACE_ID en Vercel."

// ── El documento ──────────────────────────────────────────────────────────────

type BloqueDocumento = Anthropic.DocumentBlockParam

/** Convierte el archivo subido en el bloque que entiende la API. */
async function bloqueDocumento(doc: DocumentoGuion, conCache: boolean): Promise<BloqueDocumento> {
  const cache = conCache ? { cache_control: { type: "ephemeral" as const } } : {}

  if (doc.mime === MIME_PDF) {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: doc.datos.toString("base64") },
      title: doc.nombre,
      ...cache,
    }
  }

  let texto = ""
  if (doc.mime === MIME_DOCX) {
    try {
      const mammoth = await import("mammoth")
      const r = await mammoth.extractRawText({ buffer: doc.datos })
      texto = r.value || ""
    } catch {
      throw new ErrorIA(
        "No se pudo abrir el archivo de Word. Guárdalo como PDF y vuelve a subirlo.",
        "documento",
        422
      )
    }
  } else if (doc.mime === MIME_TXT) {
    texto = doc.datos.toString("utf8")
  } else {
    throw new ErrorIA("Tipo de archivo no soportado. Sube PDF, Word (.docx) o texto.", "documento", 415)
  }

  if (!texto.trim()) {
    throw new ErrorIA("El archivo no trae texto. Si es un escaneo, súbelo en PDF.", "documento", 422)
  }

  return {
    type: "document",
    source: { type: "text", media_type: "text/plain", data: texto },
    title: doc.nombre,
    ...cache,
  }
}

// ── Instrucciones ─────────────────────────────────────────────────────────────

const SISTEMA = `Eres asistente de dirección en una casa productora mexicana. Desglosas guiones para armar el plan de rodaje: identificas cada pieza (guion, video, capítulo o episodio) y cada una de sus escenas.

Reglas que aplican siempre:
- Trabaja solo con lo que dice el documento. Si un dato no viene, déjalo vacío; no lo supongas ni lo inventes.
- Respeta la numeración del guion. Si las escenas vienen numeradas, usa esos números tal cual. Si no vienen numeradas, numéralas 1, 2, 3… en el orden en que aparecen dentro de cada pieza.
- Escribe en español y conserva la ortografía del guion en nombres propios.`

const INSTRUCCIONES_INDICE = `Desglosa el documento adjunto.

1. tipo_unidad: cómo se le llama a cada pieza independiente del documento.
   - "guion": un solo guion (cortometraje, largometraje, comercial) o varios guiones de comerciales.
   - "video": varias piezas cortas para redes o contenido digital.
   - "capitulo" o "episodio": una serie.

2. guiones: una entrada por pieza, en el orden del documento. Un documento con una sola historia lleva una sola entrada.
   - numero: el número de la pieza ("1", "2"…). Si el documento usa otro identificador (por ejemplo "EP 3" o "V2"), usa solo su número.
   - titulo: el título de la pieza tal como viene. Si no tiene, uno breve que la identifique.
   - resumen: de qué trata, en una o dos frases.
   - notas: lo que producción debe tener presente y que el guion dice de forma explícita (pendientes, "por definir", requerimientos especiales como niños, animales, vehículos, efectos o locuciones). Lista vacía si no hay.
   - escenas: todas las escenas de la pieza, en orden.

3. Cada escena:
   - numero: el número de la escena como viene en el guion; si no viene, el consecutivo dentro de la pieza.
   - encabezado: el encabezado de la escena copiado tal cual (por ejemplo "INT. COCINA - DÍA"). Vacío si la pieza no usa encabezados.
   - ie: "INT", "EXT" o "INT/EXT". Vacío si el guion no lo indica.
   - locacion: el lugar, sin INT/EXT y sin el momento del día (por ejemplo "COCINA DE LA CASA DE ANA").
   - momento: "DÍA", "NOCHE", "AMANECER" o "ATARDECER". Vacío si el guion no lo indica.
   - descripcion: qué pasa en la escena, en 15 palabras o menos.
   - personajes: los personajes que aparecen o hablan en la escena, en mayúsculas y sin repetir.
   - pagina: página del documento donde empieza la escena (la primera página es la 1). Usa 0 si no se puede saber.

Si una pieza no está dividida en escenas (por ejemplo un comercial a dos columnas o una lista de tomas), divídela por cambio de lugar o de momento: cada lugar distinto es una escena.`

function instruccionesTexto(lista: string): string {
  return `Transcribe del documento adjunto el texto de estas escenas, tal como está escrito.

Escenas:
${lista}

Para cada escena devuelve su clave y sus líneas en orden. Cada línea lleva un tipo:
- "accion": descripción de lo que se ve o sucede.
- "personaje": el nombre de quien va a hablar, solo, en su propia línea.
- "dialogo": lo que dice el personaje.
- "acotacion": indicación entre paréntesis dentro de un diálogo.
- "super": texto en pantalla, gráficos o legales.
- "transicion": CORTE A, FADE OUT y similares.
- "nota": cualquier otra anotación (notas de producción, música, audio).

Reglas:
- Copia el texto literal: no resumas, no corrijas y no agregues nada.
- No incluyas el encabezado de la escena; empieza en la primera línea después del encabezado.
- Une en una sola línea el texto que el documento parte por el ancho de la página; los párrafos distintos van en líneas distintas.
- En guiones a dos columnas (video y audio), intercala en el orden en que ocurren: lo que se ve como "accion" y lo que se escucha como "personaje" y "dialogo", "nota" o "super", según corresponda.
- Devuelve todas las claves pedidas. Si no encuentras una escena, devuélvela con la lista de líneas vacía.`
}

// ── Formato de salida ─────────────────────────────────────────────────────────
// Todo es obligatorio y sin propiedades extra: así lo exige la salida
// estructurada de la API, y nos garantiza JSON válido.

const texto = { type: "string" }
const listaDeTexto = { type: "array", items: { type: "string" } }

const ESQUEMA_INDICE = {
  type: "object",
  additionalProperties: false,
  required: ["tipo_unidad", "guiones"],
  properties: {
    tipo_unidad: { type: "string", enum: ["guion", "video", "capitulo", "episodio"] },
    guiones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["numero", "titulo", "resumen", "notas", "escenas"],
        properties: {
          numero: texto,
          titulo: texto,
          resumen: texto,
          notas: listaDeTexto,
          escenas: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "numero", "encabezado", "ie", "locacion", "momento",
                "descripcion", "personajes", "pagina",
              ],
              properties: {
                numero: texto,
                encabezado: texto,
                ie: texto,
                locacion: texto,
                momento: texto,
                descripcion: texto,
                personajes: listaDeTexto,
                pagina: { type: "integer" },
              },
            },
          },
        },
      },
    },
  },
}

const ESQUEMA_TEXTO = {
  type: "object",
  additionalProperties: false,
  required: ["escenas"],
  properties: {
    escenas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["clave", "lineas"],
        properties: {
          clave: texto,
          lineas: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["t", "x"],
              properties: {
                t: { type: "string", enum: TIPOS_LINEA },
                x: texto,
              },
            },
          },
        },
      },
    },
  },
}

// ── Llamada ───────────────────────────────────────────────────────────────────

function usoDe(msg: Anthropic.Message, modelo: string): UsoIA {
  return {
    entrada: msg.usage.input_tokens || 0,
    salida: msg.usage.output_tokens || 0,
    cache_lectura: msg.usage.cache_read_input_tokens || 0,
    cache_escritura: msg.usage.cache_creation_input_tokens || 0,
    modelo,
  }
}

function traducirError(err: unknown): ErrorIA {
  if (err instanceof ErrorIA) return err

  if (err instanceof Anthropic.APIUserAbortError || (err as Error)?.name === "AbortError" || (err as Error)?.name === "TimeoutError") {
    return new ErrorIA("La lectura tardó demasiado. Vuelve a intentar.", "tiempo", 504)
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ErrorIA("No se pudo conectar con la IA. Vuelve a intentar en un momento.", "tiempo", 504)
  }
  if (err instanceof Anthropic.APIError) {
    const detalle = err.message || ""
    switch (err.status) {
      case 401:
      case 403:
        return new ErrorIA(
          "La llave ANTHROPIC_API_KEY no es válida o no tiene permiso. Revísala en Vercel.",
          "config",
          503
        )
      case 402:
        return new ErrorIA("La cuenta de Anthropic no tiene saldo. Agrega crédito en platform.claude.com (Billing).", "limite", 503)
      case 404:
        if (/workspace/i.test(detalle)) {
          return new ErrorIA(
            "El workspace de ANTHROPIC_WORKSPACE_ID no existe o la llave no tiene acceso a él. Revísalo en Vercel.",
            "config",
            503
          )
        }
        return new ErrorIA(`El modelo "${modeloIA()}" no existe o la llave no tiene acceso. Revisa RODAJE_IA_MODELO.`, "config", 503)
      case 413:
        return new ErrorIA("El archivo es demasiado grande para leerlo de una vez. Divídelo en partes.", "documento", 413)
      case 429:
        return new ErrorIA("La IA está recibiendo demasiadas peticiones. Espera un minuto y vuelve a intentar.", "limite", 429)
      case 529:
      case 500:
      case 503:
        return new ErrorIA("La IA está saturada en este momento. Vuelve a intentar en unos minutos.", "limite", 503)
      case 400:
        if (/workspace/i.test(detalle)) return new ErrorIA(SIN_WORKSPACE, "config", 503)
        if (/credit balance|billing/i.test(detalle)) {
          return new ErrorIA("La cuenta de Anthropic no tiene saldo. Agrega crédito en platform.claude.com (Billing).", "limite", 503)
        }
        if (/too long|too large|maximum|pages|exceed/i.test(detalle)) {
          return new ErrorIA("El archivo es demasiado largo para leerlo de una vez. Divídelo en partes.", "documento", 413)
        }
        if (/pdf|document/i.test(detalle)) {
          return new ErrorIA("La IA no pudo abrir el archivo. Revisa que el PDF no esté dañado ni protegido con contraseña.", "documento", 422)
        }
        return new ErrorIA(`La IA rechazó la petición: ${detalle}`, "otro", 502)
      default:
        return new ErrorIA(`Error de la IA (${err.status ?? "sin código"}): ${detalle}`, "otro", 502)
    }
  }
  return new ErrorIA((err as Error)?.message || "Error desconocido al leer el guion", "otro", 500)
}

async function pedirJSON(opciones: {
  doc: DocumentoGuion
  instrucciones: string
  esquema: Record<string, unknown>
  maxTokens: number
  conCache: boolean
}): Promise<{ datos: unknown; uso: UsoIA }> {
  const modelo = modeloIA()
  try {
    const api = cliente()
    const documento = await bloqueDocumento(opciones.doc, opciones.conCache)

    // En streaming para que las lecturas largas no se corten por inactividad.
    // No se manda temperature ni thinking: los modelos actuales no los aceptan
    // o los deciden solos.
    const msg = await api.messages
      .stream(
        {
          model: modelo,
          max_tokens: opciones.maxTokens,
          system: SISTEMA,
          messages: [
            {
              role: "user",
              content: [documento, { type: "text", text: opciones.instrucciones }],
            },
          ],
          output_config: {
            effort: "medium",
            format: { type: "json_schema", schema: opciones.esquema },
          },
        },
        { signal: AbortSignal.timeout(TIEMPO_MAX_MS) }
      )
      .finalMessage()

    const uso = usoDe(msg, modelo)

    if (msg.stop_reason === "max_tokens") {
      throw new ErrorIA("La respuesta de la IA no cupo completa.", "truncado", 422)
    }
    if (msg.stop_reason === "refusal") {
      throw new ErrorIA("La IA no quiso procesar este documento.", "rechazo", 422)
    }
    if (msg.stop_reason === "model_context_window_exceeded") {
      throw new ErrorIA("El archivo es demasiado largo para leerlo de una vez. Divídelo en partes.", "documento", 413)
    }

    // La respuesta puede traer bloques de razonamiento antes del texto.
    const salida = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")

    let datos: unknown
    try {
      datos = JSON.parse(salida)
    } catch {
      throw new ErrorIA("La IA devolvió una respuesta que no se pudo interpretar. Vuelve a intentar.", "otro", 502)
    }
    return { datos, uso }
  } catch (err) {
    throw traducirError(err)
  }
}

// ── Limpieza de lo que devuelve la IA ─────────────────────────────────────────

function txt(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function lista(v: unknown, max: number, maxItem: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    const s = txt(x, maxItem)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= max) break
  }
  return out
}

export function normalizarIE(v: unknown): string {
  const s = txt(v, 20).toUpperCase().replace(/\./g, "")
  const int = /\bINT/.test(s)
  const ext = /\bEXT/.test(s)
  if (int && ext) return "INT/EXT"
  if (int) return "INT"
  if (ext) return "EXT"
  return ""
}

export function normalizarMomento(v: unknown): string {
  const s = txt(v, 30).toUpperCase()
  if (!s) return ""
  const plano = s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  if (plano === "DIA") return "DÍA"
  return s
}

const ETIQUETAS_VALIDAS: Etiqueta[] = ["guion", "video", "capitulo", "episodio"]

export function limpiarIndice(crudo: unknown): IndiceIA {
  const r = (crudo || {}) as Record<string, unknown>
  const tipo = ETIQUETAS_VALIDAS.includes(r.tipo_unidad as Etiqueta) ? (r.tipo_unidad as Etiqueta) : "guion"
  const guionesCrudos = Array.isArray(r.guiones) ? r.guiones.slice(0, 300) : []

  const guiones: GuionIA[] = guionesCrudos.map((gc, gi) => {
    const g = (gc || {}) as Record<string, unknown>
    const escenasCrudas = Array.isArray(g.escenas) ? g.escenas.slice(0, 600) : []
    return {
      numero: txt(g.numero, 12) || String(gi + 1),
      titulo: txt(g.titulo, 160),
      resumen: txt(g.resumen, 600),
      notas: lista(g.notas, 20, 300),
      escenas: escenasCrudas.map((ec, ei) => {
        const e = (ec || {}) as Record<string, unknown>
        const pagina = Number(e.pagina)
        return {
          numero: txt(e.numero, 12) || String(ei + 1),
          encabezado: txt(e.encabezado, 200),
          ie: normalizarIE(e.ie),
          locacion: txt(e.locacion, 160).toUpperCase(),
          momento: normalizarMomento(e.momento),
          descripcion: txt(e.descripcion, 240),
          personajes: lista(
            Array.isArray(e.personajes)
              ? e.personajes.map((p) => (typeof p === "string" ? p.toUpperCase() : p))
              : [],
            40,
            60
          ),
          pagina: Number.isFinite(pagina) && pagina > 0 ? Math.floor(pagina) : 0,
        }
      }),
    }
  })

  return { tipo_unidad: tipo, guiones: guiones.filter((g) => g.escenas.length > 0 || g.titulo) }
}

export function limpiarLineas(crudo: unknown): LineaGuion[] {
  if (!Array.isArray(crudo)) return []
  const out: LineaGuion[] = []
  for (const lc of crudo.slice(0, 2000)) {
    const l = (lc || {}) as Record<string, unknown>
    const x = typeof l.x === "string" ? l.x.replace(/[ \t]+/g, " ").trim().slice(0, 4000) : ""
    if (!x) continue
    const t = TIPOS_LINEA.includes(l.t as TipoLinea) ? (l.t as TipoLinea) : "accion"
    out.push({ t, x })
  }
  return out
}

// ── API pública ───────────────────────────────────────────────────────────────

/** Lee el archivo y devuelve sus piezas y escenas. */
export async function leerIndice(doc: DocumentoGuion): Promise<{ indice: IndiceIA; uso: UsoIA }> {
  // Sin caché: la siguiente lectura (texto) usa otro formato de salida y no
  // podría aprovecharlo; escribir caché aquí solo costaría más.
  const { datos, uso } = await pedirJSON({
    doc,
    instrucciones: INSTRUCCIONES_INDICE,
    esquema: ESQUEMA_INDICE,
    maxTokens: MAX_TOKENS_INDICE,
    conCache: false,
  })
  const indice = limpiarIndice(datos)
  if (!indice.guiones.length || !indice.guiones.some((g) => g.escenas.length)) {
    throw new ErrorIA(
      "La IA no encontró escenas en este archivo. Revisa que sea un guion y que el texto se pueda leer.",
      "documento",
      422
    )
  }
  return { indice, uso }
}

export type EscenaPedida = {
  clave: string
  guionNumero: string
  guionTitulo: string
  numero: string
  encabezado: string
  locacion: string
  pagina: number | null
}

/** Transcribe el texto de un grupo de escenas. Devuelve clave → líneas. */
export async function leerTexto(
  doc: DocumentoGuion,
  escenas: EscenaPedida[]
): Promise<{ textos: Record<string, LineaGuion[]>; uso: UsoIA }> {
  const listaEscenas = escenas
    .map((e) => {
      const pieza = `pieza ${e.guionNumero}` + (e.guionTitulo ? ` "${e.guionTitulo}"` : "")
      const donde = e.encabezado || e.locacion || "sin encabezado"
      const pag = e.pagina ? ` (página ${e.pagina})` : ""
      return `- clave "${e.clave}": ${pieza}, escena ${e.numero} — ${donde}${pag}`
    })
    .join("\n")

  // Con caché: las tandas de un mismo archivo comparten el documento, así que
  // de la segunda en adelante el archivo se cobra a una fracción.
  const { datos, uso } = await pedirJSON({
    doc,
    instrucciones: instruccionesTexto(listaEscenas),
    esquema: ESQUEMA_TEXTO,
    maxTokens: MAX_TOKENS_TEXTO,
    conCache: true,
  })

  const validas = new Set(escenas.map((e) => e.clave))
  const textos: Record<string, LineaGuion[]> = {}
  const crudas = Array.isArray((datos as { escenas?: unknown })?.escenas)
    ? ((datos as { escenas: unknown[] }).escenas)
    : []
  for (const ec of crudas) {
    const e = (ec || {}) as Record<string, unknown>
    const clave = typeof e.clave === "string" ? e.clave.trim() : ""
    if (!validas.has(clave) || textos[clave]) continue
    textos[clave] = limpiarLineas(e.lineas)
  }
  return { textos, uso }
}
