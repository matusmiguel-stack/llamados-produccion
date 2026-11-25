import type { Metadata, Viewport } from "next"
import { Figtree } from "next/font/google"
import "./globals.css"
import Header from "@/components/Header"
import CustomCursor from "@/components/CustomCursor"

const sans = Figtree({ subsets: ["latin"], variable: "--font-sans", display: "swap" })

export const metadata: Metadata = {
  title: { template: "%s — Retro Casa Productora", default: "Retro Casa Productora" },
  description: "Producción de video, fotografía y diseño con enfoque cinematográfico — Ciudad de México",
  openGraph: {
    title: "Retro Casa Productora",
    description: "Producción de video, fotografía y diseño con enfoque cinematográfico — Ciudad de México",
    siteName: "Retro Casa Productora",
    locale: "es_MX",
    type: "website",
  },
}

export const viewport: Viewport = {
  themeColor: "#060608",
  colorScheme: "dark",
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={sans.variable}>
      <head>
        <noscript>
          <style>{"[data-goo]{opacity:1!important}"}</style>
        </noscript>
      </head>
      <body>
        <CustomCursor />
        <Header />
        {children}
      </body>
    </html>
  )
}
