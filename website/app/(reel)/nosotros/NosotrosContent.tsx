"use client"

import PageTransition from "@/components/PageTransition"
import { useScrollExit } from "@/components/useScrollExit"
import styles from "./nosotros.module.css"

export default function NosotrosContent() {
  // Scroll o swipe: abajo → Proyectos, arriba → regresa a Home
  useScrollExit("/proyectos", "/")

  return (
    <PageTransition>
      <div className={styles.wrap}>
        <div className={styles.content}>
          <p className={styles.eyebrow}>Nosotros</p>
          <p className={styles.text}>
            Somos una fusión de Agencia creativa y Casa Productora, los clientes son nuestros aliados
            y con ellos hacemos equipo para poder realizar campañas publicitarias, pero principalmente
            para contar sus historias a través de contenidos para cualquier plataforma off y online.
          </p>
          <p className={styles.text}>
            Historias que han ido cambiando, evolucionando y reinventándose al igual que nosotros,
            porque estamos seguros que al final, son estas historias las que nos hacen creer que en
            Retro…
          </p>
        </div>
      </div>
    </PageTransition>
  )
}
