"use client"

import { ViewTransition } from "react"

/* Envuelve el contenido de una página para que participe en la animación
   de "push" vertical (ver app/globals.css, .nav-forward / .nav-back) al navegar. */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  )
}
