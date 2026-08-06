import "./globals.css"
import { IBM_Plex_Sans, IBM_Plex_Mono, Bodoni_Moda } from "next/font/google"
import { ToastOverride } from "../components/ToastOverride"

// Autoalojadas por next/font: no dependen de Google en vivo y no parpadean.
// Sans = interfaz · Mono = dinero, horas y códigos RS · Display = títulos,
// que recogen la voz cursiva del wordmark de Retro.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
})

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["italic"],
  variable: "--font-display",
  display: "swap",
})

export const metadata = {
  title: "Llamados Retro",
  description: "Sistema de llamados de producción audiovisual",
  manifest: "/manifest.json",
  themeColor: "#05070d",

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
      className={`${plexSans.variable} ${plexMono.variable} ${bodoni.variable}`}
    >
      <body>
        <ToastOverride />
        {children}
      </body>
    </html>
  )
}