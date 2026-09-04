// PDF de la matriz de proyecto, con las ligas clickeables.
//
// El acomodo es palabra por palabra en vez de línea completa: así el texto
// envuelve solo y cada URL queda como área clickeable en su posición real,
// aunque comparta renglón con texto normal.
import { SECCIONES_MATRIZ, partirEnLigas } from "./matriz-campos"

type MatrizPdfData = {
  nombre: string
  proyecto: string | null
  cliente: string | null
  campos: Record<string, string>
}

const AZUL: [number, number, number] = [37, 99, 235]
const TINTA: [number, number, number] = [15, 23, 42]
const GRIS: [number, number, number] = [100, 116, 139]

export async function exportMatrizPdf(data: MatrizPdfData): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "a4" })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 16, mR = 16, mBottom = 18
  const labelW = 46                       // ancho de la columna de etiquetas
  const valueX = mL + labelW + 4
  const valueW = pageW - mR - valueX
  let y = 0

  function nuevaPagina() {
    doc.addPage()
    y = 18
  }
  function asegurarEspacio(alto: number) {
    if (y + alto > pageH - mBottom) nuevaPagina()
  }

  // ── Encabezado ─────────────────────────────────────────────────────────────
  y = 20
  doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(...TINTA)
  doc.text(data.nombre || "Matriz de proyecto", mL, y)
  y += 7
  const sub = [data.proyecto, data.cliente].filter(Boolean).join("  ·  ")
  if (sub) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...GRIS)
    doc.text(sub, mL, y)
    y += 6
  }
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 9

  // ── Secciones ──────────────────────────────────────────────────────────────
  for (const sec of SECCIONES_MATRIZ) {
    asegurarEspacio(16)
    doc.setFillColor(238, 242, 255)
    doc.rect(mL, y - 4.6, pageW - mL - mR, 7.6, "F")
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...AZUL)
    doc.text(sec.titulo.toUpperCase(), mL + 2.5, y)
    y += 9

    for (const campo of sec.campos) {
      const valor = (data.campos[campo.key] || "").trim()
      const alto = dibujarFila(campo.label, valor)
      y += alto
    }
    y += 3
  }

  // ── Pie ────────────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIS)
    doc.text("Retro Casa Productora", mL, pageH - 10)
    doc.text(`${p} / ${total}`, pageW - mR, pageH - 10, { align: "right" })
  }

  const archivo = `Matriz - ${(data.proyecto || data.nombre || "proyecto").replace(/[^\w\sÁÉÍÓÚáéíóúÑñ.-]/g, "")}.pdf`
  doc.save(archivo)

  // Dibuja "etiqueta + valor" y devuelve cuánto midió de alto.
  function dibujarFila(label: string, valor: string): number {
    const yInicio = y
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRIS)
    const labelLines = doc.splitTextToSize(label, labelW)
    doc.text(labelLines, mL + labelW, y, { align: "right" })

    if (!valor) {
      doc.setFontSize(9.5); doc.setTextColor(203, 213, 225)
      doc.text("—", valueX, y)
      y += 6
    } else {
      for (const linea of valor.split("\n")) {
        if (linea.trim() === "") { y += 2.5; continue }
        dibujarLinea(linea)
      }
    }

    // Separador tenue entre campos
    const alto = Math.max(y - yInicio, labelLines.length * 4.4)
    doc.setDrawColor(233, 237, 243); doc.setLineWidth(0.2)
    doc.line(mL, yInicio + alto - 1.5, pageW - mR, yInicio + alto - 1.5)
    return alto + 2
  }

  // Acomoda una línea palabra por palabra; las URLs quedan clickeables.
  function dibujarLinea(linea: string) {
    const partes = partirEnLigas(linea)
    doc.setFontSize(9.5)
    let x = valueX
    const alturaLinea = 4.8

    for (const parte of partes) {
      // Las palabras conservan su espacio para no pegarse al reacomodar
      const palabras = parte.texto.split(/(\s+)/).filter((w) => w !== "")
      for (const palabra of palabras) {
        if (palabra.trim() === "") {
          x += doc.getTextWidth(" ")
          continue
        }
        doc.setFont("helvetica", "normal")
        doc.setTextColor(...(parte.esLiga ? AZUL : TINTA))
        let ancho = doc.getTextWidth(palabra)

        // Salto de renglón si ya no cabe
        if (x + ancho > valueX + valueW) {
          y += alturaLinea
          asegurarEspacio(alturaLinea)
          x = valueX
        }
        // Una URL más ancha que la columna se parte en trozos que sí quepan
        if (ancho > valueW) {
          for (const trozo of doc.splitTextToSize(palabra, valueW) as string[]) {
            asegurarEspacio(alturaLinea)
            if (parte.esLiga) doc.textWithLink(trozo, x, y, { url: parte.texto.trim() })
            else doc.text(trozo, x, y)
            y += alturaLinea
            x = valueX
          }
          continue
        }

        if (parte.esLiga) doc.textWithLink(palabra, x, y, { url: parte.texto.trim() })
        else doc.text(palabra, x, y)
        x += ancho
      }
    }
    y += alturaLinea
  }
}
