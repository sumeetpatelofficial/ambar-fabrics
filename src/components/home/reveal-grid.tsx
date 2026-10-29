"use client"

import { useRef, type ReactNode } from "react"
import { gsap, ScrollTrigger } from "@/lib/gsap"
import { useScene } from "@/components/home/use-scene"

/** Fades the cards of a grid up in a stagger as they come into view. Shown as is for reduced motion. */
export function RevealGrid({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useScene(ref, ({ reduce }) => {
    const root = ref.current
    if (!root || reduce) return
    const cards = gsap.utils.toArray<HTMLElement>("li", root)
    if (cards.length === 0) return
    gsap.set(cards, { autoAlpha: 0, y: 50 })
    ScrollTrigger.batch(cards, {
      start: "top 90%",
      once: true,
      onEnter: (els) =>
        gsap.to(els, {
          y: 0,
          autoAlpha: 1,
          stagger: 0.1,
          duration: 0.9,
          ease: "power3.out",
          overwrite: true,
        }),
    })
  })

  return <div ref={ref}>{children}</div>
}
