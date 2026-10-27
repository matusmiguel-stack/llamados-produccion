// Catálogos del SAT (CFDI 4.0) que se usan al facturar. Solo los valores que
// aplican a una productora; el resto se puede escribir a mano si hiciera falta.

export const REGIMENES_FISCALES: { clave: string; nombre: string }[] = [
  { clave: "601", nombre: "General de Ley Personas Morales" },
  { clave: "603", nombre: "Personas Morales con Fines no Lucrativos" },
  { clave: "605", nombre: "Sueldos y Salarios" },
  { clave: "606", nombre: "Arrendamiento" },
  { clave: "608", nombre: "Demás ingresos" },
  { clave: "612", nombre: "Personas Físicas con Actividades Empresariales y Profesionales" },
  { clave: "616", nombre: "Sin obligaciones fiscales" },
  { clave: "620", nombre: "Sociedades Cooperativas de Producción" },
  { clave: "621", nombre: "Incorporación Fiscal" },
  { clave: "623", nombre: "Opcional para Grupos de Sociedades" },
  { clave: "624", nombre: "Coordinados" },
  { clave: "625", nombre: "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas" },
  { clave: "626", nombre: "Régimen Simplificado de Confianza" },
]

export const USOS_CFDI: { clave: string; nombre: string }[] = [
  { clave: "G01", nombre: "Adquisición de mercancías" },
  { clave: "G03", nombre: "Gastos en general" },
  { clave: "I08", nombre: "Otra maquinaria y equipo" },
  { clave: "S01", nombre: "Sin efectos fiscales" },
  { clave: "CP01", nombre: "Pagos" },
]

export const FORMAS_PAGO: { clave: string; nombre: string }[] = [
  { clave: "03", nombre: "Transferencia electrónica" },
  { clave: "01", nombre: "Efectivo" },
  { clave: "02", nombre: "Cheque nominativo" },
  { clave: "04", nombre: "Tarjeta de crédito" },
  { clave: "28", nombre: "Tarjeta de débito" },
  { clave: "17", nombre: "Compensación" },
  { clave: "99", nombre: "Por definir" },
]

export const METODOS_PAGO: { clave: "PUE" | "PPD"; nombre: string }[] = [
  { clave: "PUE", nombre: "PUE · Una sola exhibición" },
  { clave: "PPD", nombre: "PPD · En parcialidades o diferido" },
]

export const MOTIVOS_CANCELACION: { clave: string; nombre: string }[] = [
  { clave: "02", nombre: "Comprobante emitido con errores sin relación" },
  { clave: "03", nombre: "No se llevó a cabo la operación" },
]

// RFC de persona moral (12) o física (13)
export const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/
