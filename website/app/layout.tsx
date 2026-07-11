import type { Metadata } from "next"
import "./globals.css"
import Nav from "@/components/Nav"
import CustomCursor from "@/components/CustomCursor"

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
        <CustomCursor />
        <Nav />
        {children}
      </body>
    </html>
  )
}
