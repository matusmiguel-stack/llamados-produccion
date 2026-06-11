"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { requireSessionProfile } from "../../../lib/session-profile"
import { AppSidebar } from "../../../components/AppSidebar"
import { MatrizPanel } from "./MatrizPanel"
import { HojaLlamadoPanel } from "./HojaLlamadoPanel"
import { InformacionGeneralPanel } from "./InformacionGeneralPanel"
import { EgresosPanel } from "./EgresosPanel"

type Project = {
  id: string
  client_id: string
  subfolder_id: string
  name: string
  code: string | null
  description: string | null
  responsable: string | null
}

type Quote = {
  id: string
  project_id: string
  name: string
  status: "draft" | "sent" | "approved"
  markup_percentage: number
  atencion: string | null
  created_at: string
  released: boolean | null
  actual_extra_expenses: number | null
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
  actual_qty: number | null
  actual_days: number | null
  actual_unit_price: number | null
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
  id: "general" | "cotizaciones" | "presupuesto" | "matriz" | "hoja-llamado" | "egresos"
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
    description: "Seguimiento financiero de la cotización liberada",
    icon: "budget",
  },
  {
    id: "matriz",
    label: "Matriz",
    description: "Generales, recursos, entregas y minuta del proyecto",
    icon: "matrix",
  },
  {
    id: "hoja-llamado",
    label: "Hoja de llamado",
    description: "Detalle operativo de cada jornada de shoot",
    icon: "callsheet",
  },
  {
    id: "egresos",
    label: "Control de egresos",
    description: "Proveedores y montos liberados por cotización",
    icon: "expenses",
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

// Financials proyectados por ítem (mirror de liberar/page.tsx)
function libItemFin(item: QuoteItem): { gasto: number; utilidad: number; venta: number } {
  const amount = item.qty * item.days * item.unit_price
  if (item.real_expense === 1) return { gasto: 0, utilidad: amount, venta: amount }
  const u = amount * ((item.released_expense || 0) / 100)
  return { gasto: amount, utilidad: u, venta: amount + u }
}

// Gasto real por ítem — 0 hasta que se llene al menos un campo real
// Incluye ítems internos (real_expense===1) si tienen datos reales capturados
function realItemGastoForBudget(item: QuoteItem): number {
  const anyFilled = item.actual_qty != null || item.actual_days != null || item.actual_unit_price != null
  if (!anyFilled) return 0   // sin datos → gasto real = 0
  const q = item.actual_qty        != null ? item.actual_qty        : Math.max(item.qty, 1)
  const d = item.actual_days       != null ? item.actual_days       : Math.max(item.days, 1)
  const p = item.actual_unit_price != null ? item.actual_unit_price : item.unit_price
  return q * d * p
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
  const [projectEmpresa, setProjectEmpresa] = useState<"retro_studio" | "retro_films" | null>(null)
  const [activeModule, setActiveModule] =
    useState<ProjectModule["id"]>("cotizaciones")
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [quotesLoaded, setQuotesLoaded] = useState(false)
  const [selectedQuote, setSelectedQuote] = useState<QuoteDetail | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [showMatriz, setShowMatriz] = useState(false)
  const [showHoja, setShowHoja] = useState(false)
  const [showGeneral, setShowGeneral] = useState(false)
  const [showEgresos, setShowEgresos] = useState(false)

  const isAdmin     = profile?.role === "admin" || profile?.role === "editor" || profile?.role === "editor_premium"
  const isProductor = profile?.role === "productor"

  // Productor solo puede ver y editar la Matriz
  const visibleModules = isProductor
    ? projectModules.filter((m) => m.id === "matriz")
    : projectModules

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowMatriz(false)
        setShowHoja(false)
        setShowGeneral(false)
        setShowEgresos(false)
        setSelectedQuote(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function loadPage() {
    const auth = await requireSessionProfile()
    if (!auth) return

    if (!["admin", "editor", "editor_premium", "productor"].includes(auth.profile.role)) {
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

    const [{ data: client }, { data: subfolder }, { data: ingreso }] = await Promise.all([
      supabase.from("clients").select("name").eq("id", projectData.client_id).single(),
      supabase
        .from("client_subfolders")
        .select("name")
        .eq("id", projectData.subfolder_id)
        .single(),
      supabase
        .from("ingresos")
        .select("empresa")
        .eq("project_id", projectId)
        .limit(1)
        .maybeSingle(),
    ])

    setProject(projectData)
    setClientName(client?.name || "Cliente")
    setSubfolderName(subfolder?.name || "Subcarpeta")
    setProjectEmpresa((ingreso?.empresa as "retro_studio" | "retro_films" | null) ?? null)
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
    if ((activeModule === "cotizaciones" || activeModule === "presupuesto") && projectId) loadQuotes()
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
              <h1 style={pageTitleStyle}>
                {project
                  ? (project.code ? `${project.code} ${project.name}` : project.name)
                  : "Cargando..."}
              </h1>
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
                    {project ? (project.code ? `${project.code} ${project.name}` : project.name) : "..."}
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
                  : isProductor ? "1fr" : "repeat(3, 1fr)",
              }}
            >
              {visibleModules.map((module) => {
                const isActive = activeModule === module.id
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => {
                      if (module.id === "general") {
                        setShowGeneral(true)
                      } else if (module.id === "matriz") {
                        setShowMatriz(true)
                      } else if (module.id === "hoja-llamado") {
                        setShowHoja(true)
                      } else if (module.id === "egresos") {
                        setShowEgresos(true)
                      } else {
                        setActiveModule(module.id)
                      }
                    }}
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

            {/* Panel del módulo activo — oculto para productor (solo usa modal de Matriz) */}
            <section style={modulePanelStyle} hidden={isProductor}>
              {activeModule === "cotizaciones" ? (
                <QuotesPanel
                  quotes={quotes}
                  loaded={quotesLoaded}
                  loadingQuote={loadingQuote}
                  onOpenQuote={openQuoteDetail}
                  projectId={projectId}
                  clientId={project?.client_id}
                  subfolderId={project?.subfolder_id}
                />
              ) : activeModule === "presupuesto" ? (
                <PresupuestoPanel
                  quotes={quotes}
                  quotesLoaded={quotesLoaded}
                  projectId={projectId}
                  isMobile={isMobile}
                  onEditarLiberacion={(quoteId) =>
                    router.push(`/proyectos/${projectId}/liberar/${quoteId}`)
                  }
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
          clientName={clientName}
          projectName={project?.name ?? ""}
          projectCode={project?.code ?? null}
          projectResponsable={project?.responsable ?? null}
          onClose={() => setSelectedQuote(null)}
          onMoved={(qId) => {
            setQuotes((prev) => prev.filter((q) => q.id !== qId))
            setSelectedQuote(null)
          }}
        />
      )}

      {/* Modal de Información General */}
      {showGeneral && (
        <div
          className="modal-overlay"
          style={modalOverlayStyle}
          onClick={() => setShowGeneral(false)}
        >
          <div
            className="modal-panel"
            style={{ ...modalPanelStyle, maxWidth: isMobile ? "100%" : 860 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeaderStyle}>
              <div>
                <p style={modalEyebrowStyle}>Proyecto · {clientName}</p>
                <h2 style={modalTitleStyle}>{project?.name}</h2>
              </div>
              <button
                onClick={() => setShowGeneral(false)}
                style={modalCloseStyle}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: isMobile ? "16px 14px 28px" : "20px 28px 32px",
                overflowY: "auto",
                maxHeight: "82vh",
              }}
            >
              <InformacionGeneralPanel
                projectId={projectId}
                projectName={project?.name ?? ""}
                projectDescription={project?.description ?? null}
                projectResponsable={project?.responsable ?? null}
                clientName={clientName}
                subfolderName={subfolderName}
                empresa={projectEmpresa}
                isMobile={isMobile}
                isAdmin={isAdmin}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Hoja de Llamado */}
      {showHoja && (
        <div
          className="modal-overlay"
          style={modalOverlayStyle}
          onClick={() => setShowHoja(false)}
        >
          <div
            className="modal-panel"
            style={{ ...modalPanelStyle, maxWidth: isMobile ? "100%" : 1100 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeaderStyle}>
              <div>
                <p style={modalEyebrowStyle}>Proyecto · {project?.name}</p>
                <h2 style={modalTitleStyle}>Hoja de llamado</h2>
              </div>
              <button
                onClick={() => setShowHoja(false)}
                style={modalCloseStyle}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: isMobile ? "16px 14px 28px" : "20px 28px 32px",
                overflowY: "auto",
                maxHeight: "82vh",
              }}
            >
              <HojaLlamadoPanel
                projectId={projectId}
                isMobile={isMobile}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Control de Egresos */}
      {showEgresos && (
        <div
          className="modal-overlay"
          style={modalOverlayStyle}
          onClick={() => setShowEgresos(false)}
        >
          <div
            className="modal-panel"
            style={{ ...modalPanelStyle, maxWidth: isMobile ? "100%" : 1000 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeaderStyle}>
              <div>
                <p style={modalEyebrowStyle}>Proyecto · {project?.name}</p>
                <h2 style={modalTitleStyle}>Control de egresos</h2>
              </div>
              <button
                onClick={() => setShowEgresos(false)}
                style={modalCloseStyle}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: isMobile ? "16px 14px 28px" : "20px 28px 32px",
                overflowY: "auto",
                maxHeight: "82vh",
              }}
            >
              <EgresosPanel
                projectId={projectId}
                isMobile={isMobile}
                projectName={project?.name ?? ""}
                projectCode={project?.code ?? null}
                empresa={projectEmpresa}
                projectResponsable={project?.responsable ?? null}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Matriz de proyecto */}
      {showMatriz && (
        <div
          className="modal-overlay"
          style={modalOverlayStyle}
          onClick={() => setShowMatriz(false)}
        >
          <div
            className="modal-panel"
            style={{ ...modalPanelStyle, maxWidth: isMobile ? "100%" : 900 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={modalHeaderStyle}>
              <div>
                <p style={modalEyebrowStyle}>Proyecto · {project?.name}</p>
                <h2 style={modalTitleStyle}>Matriz de proyecto</h2>
              </div>
              <button
                onClick={() => setShowMatriz(false)}
                style={modalCloseStyle}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            {/* Body */}
            <div
              style={{
                padding: isMobile ? "16px 14px 28px" : "20px 28px 32px",
                overflowY: "auto",
                maxHeight: "80vh",
              }}
            >
              <MatrizPanel
                projectId={projectId}
                isMobile={isMobile}
                projectName={project?.name ?? ""}
                clientName={clientName}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Presupuesto Panel ────────────────────────────────────────────────────────

function PresupuestoPanel({
  quotes,
  quotesLoaded,
  projectId,
  isMobile,
  onEditarLiberacion,
}: {
  quotes: Quote[]
  quotesLoaded: boolean
  projectId: string
  isMobile: boolean
  onEditarLiberacion: (quoteId: string) => void
}) {
  const [sections, setSections] = useState<QuoteSection[]>([])
  const [secLoading, setSecLoading] = useState(false)
  const [secLoaded, setSecLoaded] = useState(false)

  const releasedQuote = quotes.find((q) => q.released === true) ?? null

  useEffect(() => {
    if (!releasedQuote || secLoaded) return
    async function loadSections() {
      setSecLoading(true)
      try {
        const { data: secsData } = await supabase
          .from("quote_sections")
          .select("*")
          .eq("quote_id", releasedQuote!.id)
          .order("order_index")
        const loaded: QuoteSection[] = []
        for (const sec of secsData || []) {
          const { data: itemsData } = await supabase
            .from("quote_items")
            .select("*")
            .eq("section_id", sec.id)
            .order("order_index")
          loaded.push({ ...sec, items: (itemsData || []) as QuoteItem[] })
        }
        setSections(loaded)
        setSecLoaded(true)
      } finally {
        setSecLoading(false)
      }
    }
    loadSections()
  }, [releasedQuote?.id])

  const totals = useMemo(() => {
    if (!releasedQuote || !secLoaded) return null
    let libGasto = 0, libUtilidad = 0, libVenta = 0, realGasto = 0
    for (const sec of sections) {
      for (const item of sec.items) {
        const lf = libItemFin(item)
        libGasto += lf.gasto
        libUtilidad += lf.utilidad
        libVenta += lf.venta
        realGasto += realItemGastoForBudget(item)
      }
    }
    // Aplicar markup general del proyecto sobre el subtotal de venta
    const markupPct = releasedQuote.markup_percentage || 0
    const markupAmt = libVenta * (markupPct / 100)
    const libVentaFinal = libVenta + markupAmt
    libUtilidad += markupAmt

    const extraAmt = releasedQuote.actual_extra_expenses || 0
    const realGastoTotal = realGasto + extraAmt
    const realUtilidad = libVentaFinal - realGastoTotal
    const libPct  = libVentaFinal > 0 ? (libUtilidad  / libVentaFinal) * 100 : 0
    const realPct = libVentaFinal > 0 ? (realUtilidad / libVentaFinal) * 100 : 0
    return { libGasto, libUtilidad, libVenta: libVentaFinal, markupAmt, markupPct, realGasto: realGastoTotal, extraAmt, realUtilidad, libPct, realPct }
  }, [sections, releasedQuote, secLoaded])

  // ── Sin cotización liberada ────────────────────────────────────────────────
  if (!quotesLoaded || secLoading) {
    return <div style={emptyStyle}>Cargando presupuesto...</div>
  }

  if (!releasedQuote) {
    return (
      <div>
        <div style={modulePanelHeaderStyle}>
          <p style={modulePanelTitleStyle}>Presupuesto</p>
          <p style={modulePanelHintStyle}>
            Ninguna cotización ha sido liberada aún para este proyecto
          </p>
        </div>
        <div style={placeholderBoxStyle}>
          <p style={placeholderTitleStyle}>Sin presupuesto activo</p>
          <p style={placeholderTextStyle}>
            Para activar esta sección ve a{" "}
            <strong style={placeholderStrongStyle}>Cotizaciones</strong>,
            abre una cotización aprobada y presiona{" "}
            <strong style={placeholderStrongStyle}>▶ Liberar</strong>.
          </p>
        </div>
      </div>
    )
  }

  // ── Con cotización liberada ────────────────────────────────────────────────
  const t = totals
  const realColor = !t ? "#94a3b8"
    : t.realUtilidad >= t.libUtilidad ? "#34d399"
    : t.realUtilidad > 0 ? "#fbbf24"
    : "#f87171"

  const hasAnyReal = sections.some((s) =>
    s.items.some((i) => i.actual_qty != null || i.actual_days != null || i.actual_unit_price != null)
  )

  return (
    <div>
      {/* Header */}
      <div style={{ ...modulePanelHeaderStyle, alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
          <div>
            <p style={modulePanelTitleStyle}>Presupuesto</p>
            <p style={modulePanelHintStyle}>
              Basado en cotización liberada:{" "}
              <strong style={{ color: "#e2e8f0" }}>{releasedQuote.name}</strong>
              {!hasAnyReal && (
                <span style={{ color: "#fbbf24", marginLeft: 10 }}>
                  · Sin costos reales registrados aún
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => onEditarLiberacion(releasedQuote.id)}
            style={liberarBtnStyle}
          >
            ✎ Editar liberación
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {t && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 12,
          marginBottom: 20,
        }}>
          {/* Proyectado */}
          <div style={budgetCardStyle("rgba(167,139,250,0.06)", "rgba(167,139,250,0.20)")}>
            <p style={{ ...budgetCardTitleStyle, color: "#a78bfa" }}>Proyectado — Liberado</p>
            <div style={budgetRowStyle}>
              <span style={budgetLabelStyle}>Gasto liberado</span>
              <span style={budgetValueStyle}>{fmt(t.libGasto)}</span>
            </div>
            <div style={budgetRowStyle}>
              <span style={budgetLabelStyle}>Venta al cliente</span>
              <span style={budgetValueStyle}>{fmt(t.libVenta)}</span>
            </div>
            <div style={{ ...budgetRowStyle, borderTop: "1px solid rgba(148,163,184,0.12)", paddingTop: 10, marginTop: 4 }}>
              <span style={{ ...budgetLabelStyle, color: "#e2e8f0", fontWeight: 600 }}>Utilidad proyectada</span>
              <span style={{ ...budgetValueStyle, color: "#a78bfa", fontSize: 20, fontWeight: 700 }}>{fmt(t.libUtilidad)}</span>
            </div>
            <div style={budgetRowStyle}>
              <span style={budgetLabelStyle}>% sobre venta</span>
              <span style={{ ...budgetValueStyle, color: "#a78bfa", fontWeight: 600 }}>{t.libPct.toFixed(1)}%</span>
            </div>
          </div>

          {/* Real */}
          <div style={budgetCardStyle(
            `${realColor}0f`,
            `${realColor}33`,
          )}>
            <p style={{ ...budgetCardTitleStyle, color: realColor }}>
              Real — Gasto actual{!hasAnyReal ? " (sin datos)" : ""}
            </p>
            <div style={budgetRowStyle}>
              <span style={budgetLabelStyle}>Gasto real (ítems)</span>
              <span style={{ ...budgetValueStyle, color: t.realGasto > t.libGasto ? "#f87171" : t.realGasto < t.libGasto ? "#34d399" : "#94a3b8" }}>
                {fmt(t.realGasto - t.extraAmt)}
              </span>
            </div>
            {t.extraAmt > 0 && (
              <div style={budgetRowStyle}>
                <span style={budgetLabelStyle}>Gastos adicionales</span>
                <span style={{ ...budgetValueStyle, color: "#f87171" }}>{fmt(t.extraAmt)}</span>
              </div>
            )}
            <div style={budgetRowStyle}>
              <span style={budgetLabelStyle}>Venta al cliente</span>
              <span style={budgetValueStyle}>{fmt(t.libVenta)}</span>
            </div>
            <div style={{ ...budgetRowStyle, borderTop: "1px solid rgba(148,163,184,0.12)", paddingTop: 10, marginTop: 4 }}>
              <span style={{ ...budgetLabelStyle, color: "#e2e8f0", fontWeight: 600 }}>Utilidad real</span>
              <span style={{ ...budgetValueStyle, color: realColor, fontSize: 20, fontWeight: 700 }}>{fmt(t.realUtilidad)}</span>
            </div>
            <div style={budgetRowStyle}>
              <span style={budgetLabelStyle}>% sobre venta</span>
              <span style={{ ...budgetValueStyle, color: realColor, fontWeight: 600 }}>{t.realPct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Desglose por sección */}
      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(148,163,184,0.10)" }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 100px 100px" : "1fr 130px 130px 110px",
          background: "rgba(15,23,42,0.6)",
          padding: "8px 14px",
          gap: 8,
        }}>
          <span style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Rubro</span>
          <span style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Proyectado</span>
          <span style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Real</span>
          {!isMobile && <span style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Diferencia</span>}
        </div>

        {sections.filter((s) => s.items.some((i) => libItemFin(i).venta > 0)).map((sec, idx) => {
          const libSecVenta = sec.items.reduce((sum, i) => sum + libItemFin(i).venta, 0)
          const realSecGasto = sec.items.reduce((sum, i) => sum + realItemGastoForBudget(i), 0)
          const diff = libSecVenta - realSecGasto
          const diffColor = diff > 0 ? "#34d399" : diff < 0 ? "#f87171" : "#94a3b8"
          const isOdd = idx % 2 === 1
          return (
            <div
              key={sec.id}
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 100px 100px" : "1fr 130px 130px 110px",
                padding: "10px 14px",
                gap: 8,
                background: isOdd ? "rgba(148,163,184,0.04)" : "transparent",
                borderTop: "1px solid rgba(148,163,184,0.07)",
                alignItems: "center",
              }}
            >
              <span style={{ color: "#cbd5e1", fontSize: 13 }}>{sec.name}</span>
              <span style={{ color: "#94a3b8", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(libSecVenta)}</span>
              <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(realSecGasto)}</span>
              {!isMobile && (
                <span style={{ color: diffColor, fontSize: 13, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {diff >= 0 ? "+" : ""}{fmt(diff)}
                </span>
              )}
            </div>
          )
        })}

        {/* Total row */}
        {t && (
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 100px 100px" : "1fr 130px 130px 110px",
            padding: "12px 14px",
            gap: 8,
            background: "rgba(15,23,42,0.5)",
            borderTop: "1px solid rgba(148,163,184,0.15)",
            alignItems: "center",
          }}>
            <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 700 }}>TOTAL</span>
            <span style={{ color: "#a78bfa", fontSize: 13, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(t.libVenta)}</span>
            <span style={{ color: realColor, fontSize: 13, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(t.realGasto)}</span>
            {!isMobile && (
              <span style={{ color: t.libVenta - t.realGasto >= 0 ? "#34d399" : "#f87171", fontSize: 13, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {t.libVenta - t.realGasto >= 0 ? "+" : ""}{fmt(t.libVenta - t.realGasto)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Budget card styles ───────────────────────────────────────────────────────
function budgetCardStyle(bg: string, border: string): React.CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 12,
    padding: "16px 18px",
    display: "grid",
    gap: 8,
  }
}
const budgetCardTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4,
}
const budgetRowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
}
const budgetLabelStyle: React.CSSProperties = {
  color: "#64748b", fontSize: 12,
}
const budgetValueStyle: React.CSSProperties = {
  color: "#94a3b8", fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums",
}

function QuotesPanel({
  quotes,
  loaded,
  loadingQuote,
  onOpenQuote,
  projectId,
  clientId,
  subfolderId,
}: {
  quotes: Quote[]
  loaded: boolean
  loadingQuote: boolean
  onOpenQuote: (q: Quote) => void
  projectId: string
  clientId?: string
  subfolderId?: string
}) {
  const newQuoteHref = clientId
    ? `/cotizaciones?client=${clientId}&subfolder=${subfolderId ?? ""}&project=${projectId}`
    : "/cotizaciones"
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
          <Link href={newQuoteHref} style={newQuoteButtonStyle}>
            + Nueva cotización
          </Link>
        </div>
      </div>

      {!loaded ? (
        <div style={emptyStyle}>Cargando cotizaciones...</div>
      ) : quotes.length === 0 ? (
        <div style={emptyStyle}>
          No hay cotizaciones en este proyecto.{" "}
          <Link href={newQuoteHref} style={{ color: "#a78bfa" }}>
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
  clientName,
  projectName,
  projectCode,
  projectResponsable,
  onClose,
  onMoved,
}: {
  detail: QuoteDetail
  isMobile: boolean
  clientName: string
  projectName: string
  projectCode: string | null
  projectResponsable: string | null
  onClose: () => void
  onMoved: (quoteId: string) => void
}) {
  const [exporting, setExporting] = useState(false)
  const [showMove, setShowMove] = useState(false)
  const [moveClients, setMoveClients] = useState<{ id: string; name: string }[]>([])
  const [moveSubfolders, setMoveSubfolders] = useState<{ id: string; client_id: string; name: string }[]>([])
  const [moveProjects, setMoveProjects] = useState<{ id: string; name: string; client_id: string; subfolder_id: string }[]>([])
  const [moveClientId, setMoveClientId] = useState("")
  const [moveSubfolderId, setMoveSubfolderId] = useState("")
  const [moveProjectId, setMoveProjectId] = useState("")
  const [isMoving, setIsMoving] = useState(false)
  const [moveListsLoaded, setMoveListsLoaded] = useState(false)

  // Aprobar proyecto
  const [showAprobar, setShowAprobar] = useState(false)
  const [aprobarEmpresa, setAprobarEmpresa] = useState<"retro_studio" | "retro_films">("retro_studio")
  const [aproving, setAproving] = useState(false)
  const [yaAprobado, setYaAprobado] = useState(false)

  const { quote, sections } = detail
  const subtotal = quoteSubtotal(sections)
  const markupAmt = subtotal * (quote.markup_percentage / 100)
  const total = subtotal + markupAmt

  // Verificar si este proyecto ya tiene un ingreso registrado
  useEffect(() => {
    if (!quote.project_id) return
    supabase
      .from("ingresos")
      .select("id")
      .eq("project_id", quote.project_id)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setYaAprobado(true)
      })
  }, [quote.project_id])

  async function handleExportPdf() {
    setExporting(true)
    try {
      const { exportQuotePdfFromDetail } = await import("../../../lib/exportQuotePdf")
      await exportQuotePdfFromDetail(
        {
          quote: { name: quote.name, status: quote.status, markup_percentage: quote.markup_percentage, atencion: quote.atencion ?? "" },
          sections: sections.map((s) => ({
            name: s.name,
            order_index: s.order_index,
            items: s.items.map((i) => ({
              description: i.description,
              qty: i.qty,
              days: i.days,
              unit_price: i.unit_price,
              released_expense: i.released_expense,
              real_expense: i.real_expense,
              supplier: i.supplier,
            })),
          })),
        },
        clientName,
        projectName
      )
    } catch (err: any) {
      alert("Error al generar PDF: " + err.message)
    } finally {
      setExporting(false)
    }
  }

  async function openMovePanel() {
    setShowMove(true)
    if (!moveListsLoaded) {
      const [{ data: c }, { data: sf }, { data: p }] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("client_subfolders").select("id, client_id, name").order("name"),
        supabase.from("projects").select("id, name, client_id, subfolder_id").order("name"),
      ])
      setMoveClients(c || [])
      setMoveSubfolders(sf || [])
      setMoveProjects(p || [])
      setMoveListsLoaded(true)
    }
  }

  async function handleMove() {
    if (!moveProjectId) return alert("Selecciona un proyecto destino")
    if (moveProjectId === quote.project_id) return alert("La cotización ya está en ese proyecto")
    setIsMoving(true)
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ project_id: moveProjectId })
        .eq("id", quote.id)
      if (error) { alert(error.message); return }
      onMoved(quote.id)
    } finally {
      setIsMoving(false)
    }
  }

  async function confirmarAprobacion() {
    setAproving(true)

    // Si el proyecto aún no tiene código RS, asignarlo ahora
    let effectiveCode = projectCode
    if (!effectiveCode && quote.project_id) {
      const { data: nextData } = await supabase.rpc("next_project_code")
      if (nextData) {
        await supabase.from("projects").update({ code: nextData }).eq("id", quote.project_id)
        effectiveCode = nextData
      }
    }

    const iva = Math.round(total * 0.16 * 100) / 100
    const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
    const { error } = await supabase.from("ingresos").insert({
      empresa:         aprobarEmpresa,
      estatus:         "en_produccion",
      cliente_agencia: clientName,
      responsable:     projectResponsable || null,
      proyecto:        effectiveCode ? `${effectiveCode} ${projectName}` : projectName,
      subtotal:        total,
      iva,
      mes_cierre:      MESES_ES[new Date().getMonth()],
      notas:           `Aprobado desde cotización el ${new Date().toLocaleDateString("es-MX", { dateStyle: "long" })}`,
      project_id:      quote.project_id || null,
      quote_id:        quote.id || null,
    })
    if (error) { alert(error.message); setAproving(false); return }
    await supabase.from("quotes").update({ status: "approved" }).eq("id", quote.id)
    setAproving(false)
    setYaAprobado(true)
    setShowAprobar(false)
    window.location.href = "/ingresos"
  }

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
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <Link href={`/cotizaciones?quoteId=${quote.id}`} style={editQuoteBtnStyle}>
              ✏ Editar
            </Link>
            <Link
              href={`/proyectos/${quote.project_id}/liberar/${quote.id}`}
              style={liberarBtnStyle}
            >
              ▶ Liberar
            </Link>
            <button
              onClick={() => {
                if (yaAprobado) {
                  alert("Este proyecto ya fue aprobado y está registrado en el control de ingresos.")
                  return
                }
                setShowAprobar(true)
              }}
              disabled={yaAprobado}
              style={{
                ...aprobarQuoteBtnStyle,
                ...(yaAprobado ? { opacity: 0.5, cursor: "not-allowed" } : {}),
              }}
            >
              {yaAprobado ? "✓ Ya aprobado" : "✓ Aprobar"}
            </button>
            <button onClick={openMovePanel} style={moveQuoteBtnStyle}>
              ↗ Mover
            </button>
            <button onClick={handleExportPdf} disabled={exporting} style={pdfExportButtonStyle}>
              {exporting ? "Generando..." : "↓ PDF"}
            </button>
            <button onClick={onClose} style={modalCloseStyle} aria-label="Cerrar">
              ✕
            </button>
          </div>
        </div>

        {/* Panel de mover cotización */}
        {showMove && (
          <div style={movePanelStyle}>
            <p style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, margin: "0 0 12px", letterSpacing: 0.5 }}>
              MOVER COTIZACIÓN A OTRO PROYECTO
            </p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {/* Paso 1: Cliente */}
              <div>
                <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 4px" }}>1. Cliente</p>
                <select
                  value={moveClientId}
                  onChange={(e) => { setMoveClientId(e.target.value); setMoveSubfolderId(""); setMoveProjectId("") }}
                  style={moveSelectStyle}
                >
                  <option value="">Seleccionar...</option>
                  {moveClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {/* Paso 2: Subcarpeta */}
              <div>
                <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 4px" }}>2. Subcarpeta</p>
                <select
                  value={moveSubfolderId}
                  onChange={(e) => { setMoveSubfolderId(e.target.value); setMoveProjectId("") }}
                  style={moveSelectStyle}
                  disabled={!moveClientId}
                >
                  <option value="">Seleccionar...</option>
                  {moveSubfolders
                    .filter((sf) => sf.client_id === moveClientId)
                    .map((sf) => <option key={sf.id} value={sf.id}>{sf.name}</option>)}
                </select>
              </div>
              {/* Paso 3: Proyecto */}
              <div>
                <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 4px" }}>3. Proyecto</p>
                <select
                  value={moveProjectId}
                  onChange={(e) => setMoveProjectId(e.target.value)}
                  style={moveSelectStyle}
                  disabled={!moveSubfolderId}
                >
                  <option value="">Seleccionar...</option>
                  {moveProjects
                    .filter((p) => p.subfolder_id === moveSubfolderId)
                    .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleMove}
                disabled={isMoving || !moveProjectId}
                style={moveConfirmBtnStyle}
              >
                {isMoving ? "Moviendo..." : "Confirmar"}
              </button>
              <button
                onClick={() => { setShowMove(false); setMoveClientId(""); setMoveSubfolderId(""); setMoveProjectId("") }}
                style={moveCancelBtnStyle}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

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

      {/* ── Aprobar proyecto mini-modal ── */}
      {showAprobar && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => !aproving && setShowAprobar(false)}
        >
          <div
            style={{ background: "linear-gradient(160deg, rgba(13,20,38,0.99), rgba(8,12,24,0.99))", border: "1px solid rgba(148,163,184,0.14)", borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,0.6)", padding: "28px 28px 24px", width: "100%", maxWidth: 400 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🎬</div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#f8fafc", textAlign: "center" }}>Aprobar proyecto</h2>
            <p style={{ margin: "0 0 18px", color: "#94a3b8", fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
              Esto creará una entrada en <strong style={{ color: "#e2e8f0" }}>Ingresos</strong> con los totales de esta cotización.
            </p>

            {/* Resumen */}
            <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.10)", display: "grid", gap: 6 }}>
              {[
                { label: "Cliente",   value: clientName },
                { label: "Cotización",value: quote.name },
                { label: "Subtotal",  value: fmt(total) },
                { label: "IVA (16%)", value: fmt(Math.round(total * 0.16 * 100) / 100) },
                { label: "Total",     value: fmt(total * 1.16), bold: true },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(148,163,184,0.07)" }}>
                  <span style={{ color: "#64748b", fontSize: 13 }}>{r.label}</span>
                  <span style={{ color: r.bold ? "#f8fafc" : "#cbd5e1", fontWeight: r.bold ? 700 : 500, fontSize: 13, fontFamily: r.bold ? "monospace" : undefined }}>{r.value}</span>
                </div>
              ))}
            </div>

            {/* Empresa */}
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#64748b" }}>Empresa</p>
              <div style={{ display: "flex", gap: 8 }}>
                {(["retro_studio", "retro_films"] as const).map(e => (
                  <button
                    key={e}
                    onClick={() => setAprobarEmpresa(e)}
                    style={{ flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: aprobarEmpresa === e ? "1px solid rgba(52,211,153,0.4)" : "1px solid rgba(148,163,184,0.14)", background: aprobarEmpresa === e ? "rgba(16,185,129,0.15)" : "transparent", color: aprobarEmpresa === e ? "#34d399" : "#64748b" }}
                  >
                    {e === "retro_studio" ? "Retro Studio" : "Retro Films"}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAprobar(false)} disabled={aproving} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(148,163,184,0.14)", background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={confirmarAprobacion} disabled={aproving} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(52,211,153,0.3)", background: "linear-gradient(135deg, rgba(16,185,129,0.8), rgba(5,150,105,0.8))", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 24px rgba(16,185,129,0.25)" }}>
                {aproving ? "Aprobando…" : "✓ Confirmar aprobación"}
              </button>
            </div>
          </div>
        </div>
      )}
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

  if (type === "expenses") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 7h18M3 12h18M3 17h18"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M7 12v3M12 10v5M17 9v6"
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

const pdfExportButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(255,255,255,0.04)",
  color: "#94a3b8",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

const editQuoteBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid rgba(52,211,153,0.3)",
  background: "rgba(52,211,153,0.08)",
  color: "#34d399",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  textDecoration: "none",
}

const liberarBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid rgba(251,191,36,0.3)",
  background: "rgba(251,191,36,0.08)",
  color: "#fbbf24",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  textDecoration: "none",
}

const moveQuoteBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid rgba(167,139,250,0.3)",
  background: "rgba(99,102,241,0.1)",
  color: "#a78bfa",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

const aprobarQuoteBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid rgba(52,211,153,0.35)",
  background: "rgba(16,185,129,0.12)",
  color: "#34d399",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

const movePanelStyle: React.CSSProperties = {
  background: "rgba(99,102,241,0.07)",
  border: "1px solid rgba(99,102,241,0.22)",
  borderRadius: 12,
  padding: "16px 20px",
  margin: "0 20px 0",
}

const moveSelectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  boxSizing: "border-box",
}

const moveConfirmBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
}

const moveCancelBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 13,
}
