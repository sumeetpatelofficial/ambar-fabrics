"use client"

import { useRef, type ReactNode } from "react"
import { gsap } from "@/lib/gsap"
import { useScene } from "@/components/home/use-scene"

/** Fades a block up into place the first time it comes into view. Shown as is for reduced motion. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useScene(ref, ({ reduce }) => {
    if (reduce || !ref.current) return
    gsap.from(ref.current, {
      y: 40,
      opacity: 0,
      duration: 1,
      ease: "power3.out",
      scrollTrigger: { trigger: ref.current, start: "top 85%", once: true },
    })
  })
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
