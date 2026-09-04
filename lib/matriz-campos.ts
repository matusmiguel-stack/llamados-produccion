// Estructura de la matriz para las vistas de solo lectura (liga pública y PDF).
//
// El panel de edición arma su propio layout porque tiene inputs; esta lista es
// la fuente para lo que se comparte hacia afuera. Si se agrega un campo nuevo a
// la matriz, hay que sumarlo aquí para que salga en la liga y en el PDF.

export type CampoMatriz = { key: string; label: string }
export type SeccionMatriz = { titulo: string; nota?: string; campos: CampoMatriz[] }

export const SECCIONES_MATRIZ: SeccionMatriz[] = [
  {
    titulo: "Generales",
    campos: [
      { key: "nombre_proyecto", label: "Nombre del proyecto" },
      { key: "cliente",         label: "Cliente" },
      { key: "director",        label: "Director" },
      { key: "productor",       label: "Productor" },
      { key: "lider_post",      label: "Líder de post" },
      { key: "nomenclatura",    label: "Nomenclatura" },
    ],
  },
  {
    titulo: "Entregas",
    campos: [{ key: "time_table", label: "Time Table" }],
  },
  {
    titulo: "Recursos",
    campos: [
      { key: "material",            label: "Material" },
      { key: "calificacion",        label: "Calificación" },
      { key: "entregables",         label: "Entregables" },
      { key: "asignacion_capsulas", label: "Asignación de cápsulas" },
      { key: "guion_ppm",           label: "Guión / PPM" },
      { key: "legales",             label: "Legales" },
      { key: "referencia_musica",   label: "Referencia de música" },
      { key: "paqueteria_grafica",  label: "Paquetería gráfica" },
      { key: "assets",              label: "Assets" },
      { key: "liga_masters",        label: "Liga de masters" },
      { key: "liga_copia_trabajo",  label: "Liga Copia de Trabajo" },
      { key: "backup_produccion",   label: "Backup de producción" },
      { key: "backup_post",         label: "Backup de post" },
    ],
  },
  { titulo: "Minuta", campos: [{ key: "minuta", label: "Minuta" }] },
  {
    titulo: "Indicaciones extra",
    nota: "(nombres y cargos en caso de aplicar, etc.)",
    campos: [{ key: "indicaciones_extra", label: "Indicaciones" }],
  },
]

const URL_REGEX = /(https?:\/\/[^\s]+)/g

/** Parte una línea en tramos de texto y de liga, para poder hacerlas clickeables. */
export function partirEnLigas(linea: string): { texto: string; esLiga: boolean }[] {
  return linea
    .split(URL_REGEX)
    .filter((p) => p !== "")
    .map((p) => ({ texto: p, esLiga: /^https?:\/\//.test(p) }))
}

/** Genera el token de una liga para compartir: 64 caracteres hex. */
export function nuevoShareToken(): string {
  const hex = () => crypto.randomUUID().replace(/-/g, "")
  return hex() + hex()
}
