import gsap from "gsap"

/* Cambio de texto letra por letra: las letras viejas suben y se desenfocan,
   las nuevas entran desde abajo. Al terminar se deja el texto plano. */

const running = new WeakMap<HTMLElement, () => void>()

function split(el: HTMLElement, text: string) {
  el.textContent = ""
  const chars: HTMLElement[] = []
  for (const run of text.match(/\s+|\S+/g) ?? []) {
    if (/^\s+$/.test(run)) {
      el.append(document.createTextNode(" "))
      continue
    }
    const word = document.createElement("span")
    word.style.cssText = "display:inline-block;white-space:nowrap"
    for (const ch of Array.from(run)) {
      const c = document.createElement("span")
      c.style.display = "inline-block"
      c.textContent = ch
      word.append(c)
      chars.push(c)
    }
    el.append(word)
  }
  return chars
}

export function swapText(el: HTMLElement, text: string) {
  running.get(el)?.()
  const current = el.getAttribute("aria-label") ?? el.textContent ?? ""
  if (current === text) {
    el.textContent = text
    el.removeAttribute("aria-label")
    return
  }
  el.setAttribute("aria-label", text)

  let inTl: gsap.core.Tween | null = null
  const finish = () => {
    el.textContent = text
    el.removeAttribute("aria-label")
    running.delete(el)
  }
  const outTl = gsap.to(split(el, el.textContent ?? ""), {
    yPercent: -45, opacity: 0, filter: "blur(.3em)",
    duration: 0.3, ease: "power2.in", stagger: 0.0096,
    onComplete: () => {
      inTl = gsap.fromTo(split(el, text),
        { yPercent: 45, opacity: 0, filter: "blur(.3em)" },
        { yPercent: 0, opacity: 1, filter: "blur(0em)", duration: 0.55, ease: "power3.out", stagger: 0.016, onComplete: finish },
      )
    },
  })
  running.set(el, () => {
    outTl.kill()
    inTl?.kill()
    finish()
  })
}
