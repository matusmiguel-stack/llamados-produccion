import styles from "./SectionTitle.module.css"

/* Título grande arriba a la izquierda, consistente entre Films, Nosotros y Proyectos */
export default function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h1 className={styles.title}>{children}</h1>
}
