import PageTransition from "@/components/PageTransition"
import FilmsCarousel from "@/components/FilmsCarousel"
import { FILMS } from "@/lib/films"

export default function FilmsContent() {
  return (
    <PageTransition>
      <FilmsCarousel films={FILMS} />
    </PageTransition>
  )
}
