import FilmsContent from "./FilmsContent"

export const metadata = { title: "Films", robots: { index: false, follow: false } }

export default function FilmsPage() {
  return <FilmsContent />
}
