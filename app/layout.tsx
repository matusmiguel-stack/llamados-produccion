import "./globals.css"

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
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}