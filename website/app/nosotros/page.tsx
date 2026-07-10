export const metadata = { title: "Nosotros — Retro Casa Productora" }

export default function NosotrosPage() {
  return (
    <main style={{ minHeight: "100dvh", paddingTop: 80, paddingInline: 48 }}>
      <p style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--red)", marginBottom: 12 }}>Nosotros</p>
      <h1 style={{ fontFamily: "var(--fd)", fontStyle: "italic", fontSize: "clamp(32px, 6vw, 72px)", fontWeight: 400 }}>Retro Casa<br />Productora</h1>
    </main>
  )
}
