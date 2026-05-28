"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { requireSessionProfile } from "../../../lib/session-profile"
import { AppSidebar } from "../../../components/AppSidebar"

type Project = {
  id: string
  client_id: string
  subfolder_id: string
  name: string
  description: string | null
}

type Quote = {
  id: string
  project_id: string
  name: string
  status: "draft" | "sent" | "approved"
  markup_percentage: number
  created_at: string
}

type QuoteItem = {
  id: string
  section_id: string
  description: string
  qty: number
  days: number
  unit_price: number
  released_expense: number
  real_expense: number
  supplier: string | null
  order_index: number
}

type QuoteSection = {
  id: string
  quote_id: string
  name: string
  order_index: number
  items: QuoteItem[]
}

type QuoteDetail = {
  quote: Quote
  sections: QuoteSection[]
}

type ProjectModule = {
  id: "general" | "cotizaciones" | "presupuesto" | "matriz" | "hoja-llamado"
  label: string
  description: string
  icon: string
  comingSoon?: boolean
}

const projectModules: ProjectModule[] = [
  {
    id: "general",
    label: "Información general",
    description: "Datos base, contactos y contexto del proyecto",
    icon: "info",
    comingSoon: true,
  },
  {
    id: "cotizaciones",
    label: "Cotizaciones",
    description: "Presupuestos por secciones e ítems con markup",
    icon: "quotes",
  },
  {
    id: "presupuesto",
    label: "Presupuesto",
    description: "Costos, partidas y seguimiento financiero",
    icon: "budget",
    comingSoon: true,
  },
  {
    id: "matriz",
    label: "Matriz",
    description: "Planeación de recursos, roles y disponibilidad",
    icon: "matrix",
    comingSoon: true,
  },
  {
    id: "hoja-llamado",
    label: "Hoja de llamado",
    description: "Detalle operativo de cada jornada de shoot",
    icon: "callsheet",
    comingSoon: true,
  },
]

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(n)
}

function itemTotal(item: QuoteItem): number {
  return item.qty * item.days * item.unit_price
}

function sectionSubtotal(section: QuoteSection): number {
  return section.items.reduce((sum, i) => sum + itemTotal(i), 0)
}

function quoteSubtotal(sections: QuoteSection[]): number {
  return sections.reduce((sum, s) => sum + sectionSubtotal(s), 0)
}

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = String(params.projectId || "")

  const [profile, setProfile] = useState<any>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [clientName, setClientName] = useState("")
  const [subfolderName, setSubfolderName] = useState("")
  const [activeModule, setActiveModule] =
    useState<ProjectModule["id"]>("cotizaciones")
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [quotesLoaded, setQuotesLoaded] = useState(false)
  const [selectedQuote, setSelectedQuote] = useState<QuoteDetail | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)

  const isAdmin = profile?.role === "admin"

  const activeModuleData = useMemo(
    () =>
      projectModules.find((m) => m.id === activeModule) || projectModules[0],
    [activeModule]
  )

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadPage() {
    const auth = await requireSessionProfile()
    if (!auth) return

    if (auth.profile.role !== "admin") {
      window.location.href = "/"
      return
    }

    setProfile(auth.profile)

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single()

    if (projectError || !projectData) {
      alert(projectError?.message || "Proyecto no encontrado")
      router.push("/proyectos")
      return
    }

    const [{ data: client }, { data: subfolder }] = await Promise.all([
      supabase.from("clients").select("name").eq("id", projectData.client_id).single(),
      supabase
        .from("client_subfolders")
        .select("name")
        .eq("id", projectData.subfolder_id)
        .single(),
    ])

    setProject(projectData)
    setClientName(client?.name || "Cliente")
    setSubfolderName(subfolder?.name || "Subcarpeta")
  }

  async function loadQuotes() {
    if (quotesLoaded) return
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })

    if (error) return alert(error.message)
    setQuotes(data || [])
    setQuotesLoaded(true)
  }

  async function openQuoteDetail(quote: Quote) {
    setLoadingQuote(true)
    try {
      const { data: sectionsData, error: secErr } = await supabase
        .from("quote_sections")
        .select("*")
        .eq("quote_id", quote.id)
        .order("order_index")

      if (secErr) throw secErr

      const sections: QuoteSection[] = []
      for (const sec of sectionsData || []) {
        const { data: itemsData, error: itemsErr } = await supabase
          .from("quote_items")
          .select("*")
          .eq("section_id", sec.id)
          .order("order_index")

        if (itemsErr) throw itemsErr
        sections.push({ ...sec, items: itemsData || [] })
      }

      setSelectedQuote({ quote, sections })
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoadingQuote(false)
    }
  }

  useEffect(() => {
    if (projectId) loadPage()
  }, [projectId])

  useEffect(() => {
    if (activeModule === "cotizaciones" && projectId) loadQuotes()
  }, [activeModule, projectId])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const backHref = project
    ? `/proyectos?client=${project.client_id}&subfolder=${project.subfolder_id}`
    : "/proyectos"

  return (
    <div style={appShellStyle}>
      <AppSidebar
        profile={profile}
        user={null}
        isAdmin={isAdmin}
        isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main
        style={{ ...mainStyle, padding: isMobile ? "76px 14px 24px" : "28px 32px" }}
      >
        <div style={pageContainerStyle}>
          <header style={pageHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Proyecto</p>
              <h1 style={pageTitleStyle}>{project?.name || "Cargando..."}</h1>
              <p style={pageSubtitleStyle}>
                {clientName} · {subfolderName}
              </p>
            </div>
          </header>

          <section style={drivePanelStyle}>
            <div style={toolbarStyle}>
              <div style={navStyle}>
                <Link href={backHref} style={backButtonStyle}>
                  ← Volver
                </Link>

                <nav style={breadcrumbStyle} aria-label="Ruta del proyecto">
                  <Link href="/proyectos" style={breadcrumbLinkStyle}>
                    Proyectos
                  </Link>
                  <span style={breadcrumbDividerStyle}>/</span>
                  <span style={breadcrumbMutedStyle}>{clientName}</span>
                  <span style={breadcrumbDividerStyle}>/</span>
                  <span style={breadcrumbMutedStyle}>{subfolderName}</span>
                  <span style={breadcrumbDividerStyle}>/</span>
                  <span style={breadcrumbCurrentStyle}>
                    {project?.name || "..."}
                  </span>
                </nav>
              </div>
            </div>

            {project?.description?.trim() && (
              <p style={projectDescriptionStyle}>{project.description}</p>
            )}

            <div
              style={{
                ...moduleGridStyle,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(3, 1fr)",
              }}
            >
              {projectModules.map((module) => {
                const isActive = activeModule === module.id
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => setActiveModule(module.id)}
                    style={{
                      ...moduleCardStyle,
                      ...(isActive ? moduleCardActiveStyle : {}),
                    }}
                  >
                    <span style={moduleIconWrapStyle(isActive, module.id)}>
                      <ModuleIcon type={module.icon} />
                    </span>
                    <span style={moduleLabelStyle}>{module.label}</span>
                    <span style={moduleDescriptionStyle}>
                      {module.description}
                    </span>
                    {module.comingSoon && (
                      <span style={comingSoonBadgeStyle}>Próximamente</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Panel del módulo activo */}
            <section style={modulePanelStyle}>
              {activeModule === "cotizaciones" ? (
                <QuotesPanel
                  quotes={quotes}
                  loaded={quotesLoaded}
                  loadingQuote={loadingQuote}
                  onOpenQuote={openQuoteDetail}
                  projectId={projectId}
                />
              ) : (
                <>
                  <div style={modulePanelHeaderStyle}>
                    <p style={modulePanelTitleStyle}>
                      {activeModuleData.label}
                    </p>
                    <p style={modulePanelHintStyle}>
                      Esta sección se implementará en una siguiente etapa
                    </p>
                  </div>
                  <div style={placeholderBoxStyle}>
                    <p style={placeholderTitleStyle}>
                      {activeModuleData.label}
                    </p>
                    <p style={placeholderTextStyle}>
                      Aquí vivirá el módulo de{" "}
                      {activeModuleData.label.toLowerCase()} para{" "}
                      <strong style={placeholderStrongStyle}>
                        {project?.name || "este proyecto"}
                      </strong>
                      .
                    </p>
                  </div>
                </>
              )}
            </section>
          </section>
        </div>
      </main>

      {/* Modal de detalle de cotización */}
      {selectedQuote && (
        <QuoteModal
          detail={selectedQuote}
          isMobile={isMobile}
          onClose={() => setSelectedQuote(null)}
        />
      )}
    </div>
  )
}

function QuotesPanel({
  quotes,
  loaded,
  loadingQuote,
  onOpenQuote,
  projectId,
}: {
  quotes: Quote[]
  loaded: boolean
  loadingQuote: boolean
  onOpenQuote: (q: Quote) => void
  projectId: string
}) {
  return (
    <div>
      <div style={modulePanelHeaderStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p style={modulePanelTitleStyle}>Cotizaciones</p>
            <p style={modulePanelHintStyle}>
              {loaded
                ? `${quotes.length} cotización${quotes.length === 1 ? "" : "es"} en este proyecto`
                : "Cargando..."}
            </p>
          </div>
          <Link href="/cotizaciones" style={newQuoteButtonStyle}>
            + Nueva cotización
          </Link>
        </div>
      </div>

      {!loaded ? (
        <div style={emptyStyle}>Cargando cotizaciones...</div>
      ) : quotes.length === 0 ? (
        <div style={emptyStyle}>
          No hay cotizaciones en este proyecto.{" "}
          <Link href="/cotizaciones" style={{ color: "#a78bfa" }}>
            Crea la primera.
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {quotes.map((q) => (
            <button
              key={q.id}
              onClick={() => !loadingQuote && onOpenQuote(q)}
              style={quoteRowStyle}
              disabled={loadingQuote}
            >
              <div style={quoteRowIconStyle}>
                <QuoteIcon />
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <p style={quoteRowNameStyle}>{q.name}</p>
                <p style={quoteRowMetaStyle}>
                  {new Date(q.created_at).toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  · Markup {q.markup_percentage}%
                </p>
              </div>
              <span style={statusBadgeStyle(q.status)}>
                {q.status === "draft"
                  ? "Borrador"
                  : q.status === "sent"
                    ? "Enviada"
                    : "Aprobada"}
              </span>
              <span style={quoteRowArrowStyle}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function QuoteModal({
  detail,
  isMobile,
  onClose,
}: {
  detail: QuoteDetail
  isMobile: boolean
  onClose: () => void
}) {
  const { quote, sections } = detail
  const subtotal = quoteSubtotal(sections)
  const markupAmt = subtotal * (quote.markup_percentage / 100)
  const total = subtotal + markupAmt

  const COL = isMobile
    ? "1fr"
    : "2fr 56px 56px 100px 100px 100px 1fr 100px"

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div
        style={{ ...modalPanelStyle, maxWidth: isMobile ? "100%" : 1000 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={modalHeaderStyle}>
          <div>
            <p style={modalEyebrowStyle}>Cotización</p>
            <h2 style={modalTitleStyle}>{quote.name}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <span style={statusBadgeStyle(quote.status)}>
                {quote.status === "draft"
                  ? "Borrador"
                  : quote.status === "sent"
                    ? "Enviada"
                    : "Aprobada"}
              </span>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                Markup {quote.markup_percentage}%
              </span>
            </div>
          </div>
          <button onClick={onClose} style={modalCloseStyle} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {/* Sections */}
        <div style={modalBodyStyle}>
          {sections.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: 13 }}>
              Esta cotización no tiene secciones.
            </p>
          ) : (
            sections.map((sec) => {
              const secTotal = sectionSubtotal(sec)
              return (
                <div key={sec.id} style={modalSectionStyle}>
                  <div style={modalSectionHeaderStyle}>
                    <p style={modalSectionTitleStyle}>{sec.name}</p>
                    <span style={modalSectionTotalStyle}>{fmt(secTotal)}</span>
                  </div>

                  {/* Column headers */}
                  {!isMobile && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: COL,
                        gap: 8,
                        padding: "0 4px 6px",
                        color: "#64748b",
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                      }}
                    >
                      <span>Descripción</span>
                      <span style={{ textAlign: "right" }}>Cant.</span>
                      <span style={{ textAlign: "right" }}>Días</span>
                      <span style={{ textAlign: "right" }}>P. unit.</span>
                      <span style={{ textAlign: "right" }}>G. lib.</span>
                      <span style={{ textAlign: "right" }}>G. real</span>
                      <span>Proveedor</span>
                      <span style={{ textAlign: "right" }}>Total</span>
                    </div>
                  )}

                  <div style={{ display: "grid", gap: 4 }}>
                    {sec.items.map((item) => {
                      const tot = itemTotal(item)
                      return (
                        <div
                          key={item.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : COL,
                            gap: 8,
                            alignItems: "center",
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.025)",
                          }}
                        >
                          {isMobile ? (
                            <div style={{ display: "grid", gap: 4 }}>
                              <p
                                style={{
                                  margin: 0,
                                  color: "#f8fafc",
                                  fontSize: 13,
                                  fontWeight: 500,
                                }}
                              >
                                {item.description || "—"}
                              </p>
                              <p
                                style={{
                                  margin: 0,
                                  color: "#64748b",
                                  fontSize: 11,
                                }}
                              >
                                {item.qty} × {item.days} días × {fmt(item.unit_price)}
                                {item.supplier ? ` · ${item.supplier}` : ""}
                              </p>
                              <p
                                style={{
                                  margin: 0,
                                  color: "#a78bfa",
                                  fontSize: 13,
                                  fontWeight: 600,
                                }}
                              >
                                {fmt(tot)}
                              </p>
                            </div>
                          ) : (
                            <>
                              <span
                                style={{
                                  color: "#e2e8f0",
                                  fontSize: 13,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.description || "—"}
                              </span>
                              <span style={readCellStyle}>{item.qty}</span>
                              <span style={readCellStyle}>{item.days}</span>
                              <span style={readCellStyle}>{fmt(item.unit_price)}</span>
                              <span style={readCellStyle}>
                                {fmt(item.released_expense)}
                              </span>
                              <span style={readCellStyle}>{fmt(item.real_expense)}</span>
                              <span
                                style={{
                                  color: "#94a3b8",
                                  fontSize: 12,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.supplier || "—"}
                              </span>
                              <span
                                style={{
                                  ...readCellStyle,
                                  color: "#a78bfa",
                                  fontWeight: 600,
                                }}
                              >
                                {fmt(tot)}
                              </span>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}

          {/* Totals */}
          <div style={modalTotalsStyle}>
            <div style={modalTotalRowStyle}>
              <span style={{ color: "#64748b", fontSize: 13 }}>Subtotal</span>
              <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                {fmt(subtotal)}
              </span>
            </div>
            <div style={modalTotalRowStyle}>
              <span style={{ color: "#64748b", fontSize: 13 }}>
                Markup ({quote.markup_percentage}%)
              </span>
              <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                {fmt(markupAmt)}
              </span>
            </div>
            <div
              style={{
                ...modalTotalRowStyle,
                borderTop: "1px solid rgba(148,163,184,0.16)",
                paddingTop: 12,
                marginTop: 4,
              }}
            >
              <span
                style={{ color: "#f8fafc", fontSize: 15, fontWeight: 700 }}
              >
                Total
              </span>
              <span
                style={{ color: "#a78bfa", fontSize: 20, fontWeight: 700 }}
              >
                {fmt(total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModuleIcon({ type }: { type: string }) {
  if (type === "quotes") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <rect
          x="9"
          y="3"
          width="6"
          height="4"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M9 12h6M9 16h4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  if (type === "budget") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3v18"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M7 8h8.5a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (type === "matrix") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect
          x="3"
          y="3"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <rect
          x="14"
          y="3"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <rect
          x="3"
          y="14"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <rect
          x="14"
          y="14"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    )
  }

  if (type === "callsheet") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 4h8l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M16 4v4h4M8 13h8M8 17h5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 10v6M12 8h.01"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function QuoteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="9"
        y="3"
        width="6"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M9 12h6M9 16h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function statusBadgeStyle(
  status: "draft" | "sent" | "approved"
): React.CSSProperties {
  const map = {
    draft: {
      bg: "rgba(148,163,184,0.10)",
      border: "rgba(148,163,184,0.18)",
      text: "#94a3b8",
    },
    sent: {
      bg: "rgba(14,165,233,0.12)",
      border: "rgba(56,189,248,0.22)",
      text: "#bae6fd",
    },
    approved: {
      bg: "rgba(34,197,94,0.12)",
      border: "rgba(74,222,128,0.22)",
      text: "#86efac",
    },
  }
  const c = map[status]
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.text,
    whiteSpace: "nowrap",
  }
}

const appShellStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const pageContainerStyle: React.CSSProperties = {
  maxWidth: 980,
  margin: "0 auto",
}

const pageHeaderStyle: React.CSSProperties = {
  marginBottom: 18,
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 700,
}

const pageTitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#f8fafc",
  fontSize: 28,
  letterSpacing: -0.6,
  lineHeight: 1.1,
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: 13,
}

const drivePanelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
}

const toolbarStyle: React.CSSProperties = {
  marginBottom: 14,
}

const navStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
}

const backButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#cbd5e1",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 500,
}

const breadcrumbStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
}

const breadcrumbLinkStyle: React.CSSProperties = {
  color: "#a78bfa",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 600,
}

const breadcrumbDividerStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 12,
}

const breadcrumbMutedStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
}

const breadcrumbCurrentStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 12,
  fontWeight: 600,
}

const projectDescriptionStyle: React.CSSProperties = {
  margin: "0 0 14px",
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
}

const moduleGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  marginBottom: 14,
}

const moduleCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  justifyItems: "start",
  textAlign: "left",
  padding: "14px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(255,255,255,0.02)",
  cursor: "pointer",
  color: "inherit",
}

const moduleCardActiveStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.10)",
  border: "1px solid rgba(167,139,250,0.24)",
  boxShadow: "0 10px 30px rgba(124,58,237,0.12)",
}

function moduleIconWrapStyle(
  active: boolean,
  moduleId: string
): React.CSSProperties {
  const isQuotes = moduleId === "cotizaciones"
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 11,
    color: active ? "#ddd6fe" : isQuotes ? "#c4b5fd" : "#93c5fd",
    background: active
      ? "rgba(124,58,237,0.18)"
      : isQuotes
        ? "rgba(124,58,237,0.10)"
        : "rgba(59,130,246,0.12)",
    border: active
      ? "1px solid rgba(167,139,250,0.24)"
      : isQuotes
        ? "1px solid rgba(167,139,250,0.16)"
        : "1px solid rgba(96,165,250,0.18)",
  }
}

const moduleLabelStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const moduleDescriptionStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
}

const comingSoonBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(148,163,184,0.10)",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "#94a3b8",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const modulePanelStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(2,6,23,0.28)",
}

const modulePanelHeaderStyle: React.CSSProperties = {
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const modulePanelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 600,
}

const modulePanelHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const placeholderBoxStyle: React.CSSProperties = {
  padding: "28px 20px",
  borderRadius: 12,
  border: "1px dashed rgba(148,163,184,0.18)",
  background: "rgba(255,255,255,0.02)",
  textAlign: "center",
}

const placeholderTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#e2e8f0",
  fontSize: 14,
  fontWeight: 600,
}

const placeholderTextStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
}

const placeholderStrongStyle: React.CSSProperties = {
  color: "#cbd5e1",
  fontWeight: 600,
}

const emptyStyle: React.CSSProperties = {
  padding: "28px 16px",
  textAlign: "center",
  color: "#64748b",
  fontSize: 13,
}

const newQuoteButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "7px 14px",
  borderRadius: 8,
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "white",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600,
  boxShadow: "0 8px 24px rgba(124,58,237,0.22)",
  whiteSpace: "nowrap",
  flexShrink: 0,
}

const quoteRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(255,255,255,0.025)",
  cursor: "pointer",
  color: "inherit",
  textAlign: "left",
  transition: "background 0.15s ease, border-color 0.15s ease",
}

const quoteRowIconStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: 10,
  background: "rgba(124,58,237,0.14)",
  border: "1px solid rgba(167,139,250,0.18)",
  color: "#c4b5fd",
  flexShrink: 0,
}

const quoteRowNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const quoteRowMetaStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const quoteRowArrowStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 16,
  flexShrink: 0,
}

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.60)",
  backdropFilter: "blur(4px)",
  zIndex: 10000,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "32px 16px",
  overflowY: "auto",
}

const modalPanelStyle: React.CSSProperties = {
  width: "100%",
  background:
    "linear-gradient(180deg, rgba(10,14,26,0.99) 0%, rgba(6,9,18,0.99) 100%)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 20,
  boxShadow: "0 40px 120px rgba(0,0,0,0.60)",
  overflow: "hidden",
}

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: "20px 24px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const modalEyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 700,
}

const modalTitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: -0.4,
}

const modalCloseStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#94a3b8",
  cursor: "pointer",
  fontSize: 14,
  flexShrink: 0,
}

const modalBodyStyle: React.CSSProperties = {
  padding: "20px 24px",
  display: "grid",
  gap: 20,
  maxHeight: "70vh",
  overflowY: "auto",
}

const modalSectionStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
}

const modalSectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 8,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const modalSectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#e2e8f0",
  fontSize: 14,
  fontWeight: 600,
}

const modalSectionTotalStyle: React.CSSProperties = {
  color: "#a78bfa",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

const readCellStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  textAlign: "right",
}

const modalTotalsStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: "16px 20px",
  borderRadius: 14,
  background: "rgba(124,58,237,0.06)",
  border: "1px solid rgba(167,139,250,0.12)",
}

const modalTotalRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
}
