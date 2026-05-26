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
    icon: "/logo-retro.png",
    apple: "/logo-retro.png",
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