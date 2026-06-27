import fs from "fs"
const { buildHojaDoc } = await import("./lib/exportHojaPdf.ts")
const puestos = ["Director","Productor","AD","DP","Gaffer","Foquista","Sonidista","Arte","Vestuario","Maquillista","Staff","Catering","Chofer","Asist. Cámara","Best Boy","Eléctrico","Tramoyista","Script","Still","Data Manager"]
const mkCrew = (n) => Array.from({ length: n }, (_, i) => ({ puesto: puestos[i % puestos.length], nombre: `Persona Apellido ${i + 1}`, retro: "06:00", locacion: "06:45", pickup: "05:30", notas: "" }))
const data = {
  fecha_rodaje: "2026-07-01", titulo: "Spot GNP — Mención Televisa", dia_num: 1, dia_total: 2,
  avanzada: "05:00", client_on_loc: "08:00", director: "Miguel", productor: "Charlie", ready_to_shoot: "07:30",
  direcciones: [{ nombre: "Foro Estudios Churubusco", url: "maps.app/xyz" }],
  amanecer: "06:10", atardecer: "20:15", clima: "Despejado", lluvia: "10%",
  locaciones: [{ locacion: "Foro 3", cap: "50", horario: "06:00-22:00", accion: "Escena 1-4", pag: "3", notas: "" }],
  cast_list: [
    { num: "1", nombre: "Actor Principal", on_loc: "07:00", makeup: "07:30", hairdress: "08:00", wardrobe: "08:30", on_set: "09:00", ensayo: "09:15", toma: "09:30", notas: "Llega peinado y rasurado. Trae 2 cambios de ropa formal (azul y gris). Confirmar alergias de catering antes de comida." },
    { num: "2", nombre: "Actriz Secundaria", on_loc: "07:30", makeup: "08:00", hairdress: "08:30", wardrobe: "09:00", on_set: "09:30", ensayo: "09:45", toma: "10:00", notas: "Vestuario propio. Maquillaje natural, evitar brillos para la escena de exteriores del mediodía." },
  ],
  crew: mkCrew(40),
  arte_needs: "Set dressing oficina", makeup_needs: "Natural", vestuario_needs: "Formal corporativo", efectos_needs: "",
  vehiculos: "2 camionetas", equipo_especial: "Dana, steadicam", notas_produccion: "Comida 14:00",
}
const doc = await buildHojaDoc(data)
fs.writeFileSync("/tmp/hoja_test2.pdf", Buffer.from(doc.output("arraybuffer")))
console.log("escrito | páginas:", doc.getNumberOfPages())
