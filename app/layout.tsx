import "./globals.css"
import { Archivo } from "next/font/google"
import { ToastOverride } from "../components/ToastOverride"

// Autoalojada por next/font: no depende de Google en vivo y no parpadea.
// Una sola familia variable con eje de ancho (wdth): ancha para títulos,
// normal para la interfaz y angosta para horas y montos.
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-sans",
  display: "swap",
})

export const metadata = {
  title: "Llamados Retro",
  description: "Sistema de llamados de producción audiovisual",
  manifest: "/manifest.json",
  themeColor: "#18181A",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Llamados Retro",
  },

  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="es"
      className={archivo.variable}
    >
      <body>
        <ToastOverride />
        {children}
      </body>
    </html>
  )
}