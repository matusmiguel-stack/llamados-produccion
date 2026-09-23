"use client"

import PageTransition from "@/components/PageTransition"
import { useScrollExit } from "@/components/useScrollExit"
import styles from "./nosotros.module.css"

const BG_VIMEO_ID = "1229379326"
const BG_VIMEO_HASH = "aeb1e744f0"

export default function NosotrosContent() {
  // Scroll o swipe hacia abajo → sigue con Proyectos (mismo orden que el menú)
  useScrollExit("/proyectos")

  return (
    <PageTransition>
      <main className={styles.root}>
        {/* Video de fondo — textura decorativa, sin controles ni sonido */}
        <div className={styles.videoBg}>
          <iframe
            className={styles.video}
            src={`https://player.vimeo.com/video/${BG_VIMEO_ID}?h=${BG_VIMEO_HASH}&background=1&autoplay=1&muted=1&loop=1&controls=0&byline=0&title=0&portrait=0&dnt=1`}
            allow="autoplay"
            tabIndex={-1}
            aria-hidden
          />
          <div className={styles.overlay} aria-hidden />
        </div>

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
      </main>
    </PageTransition>
  )
}
