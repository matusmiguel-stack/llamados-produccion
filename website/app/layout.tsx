import type { Metadata } from "next"
import "./globals.css"
import Nav from "@/components/Nav"

export const metadata: Metadata = {
  title: "Retro Casa Productora",
  description: "Producción de video, fotografía y diseño con enfoque cinematográfico — Ciudad de México",
  openGraph: {
    title: "Retro Casa Productora",
    description: "Producción de video, fotografía y diseño con enfoque cinematográfico — Ciudad de México",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  )
}
