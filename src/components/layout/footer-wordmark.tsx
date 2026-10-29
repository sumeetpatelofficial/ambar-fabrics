"use client"

import { useEffect, useRef } from "react"

/**
 * The oversized "ambar" at the foot of every page. It rises into place as the footer scrolls into view.
 * GSAP is loaded only when the footer is near, so pages that never reach it do not pay for it; with
 * reduced motion the word simply sits there.
 */
export function FooterWordmark({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (
      !el ||
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return
    let cleanup: (() => void) | undefined
    let cancelled = false
    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        const { gsap, ScrollTrigger } = await import("@/lib/gsap")
        if (cancelled) return
        const tween = gsap.fromTo(
          el,
          { yPercent: 45 },
          {
            yPercent: 0,
            ease: "none",
            scrollTrigger: {
              trigger: el.closest("footer"),
              start: "top 85%",
              end: "bottom bottom",
              scrub: true,
            },
          }
        )
        cleanup = () => {
          tween.scrollTrigger?.kill()
          tween.kill()
          ScrollTrigger.refresh()
        }
      },
      { rootMargin: "600px 0px" }
    )
    io.observe(el)
    return () => {
      cancelled = true
      io.disconnect()
      cleanup?.()
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="mt-[88px] font-display text-[clamp(7.5rem,25vw,22.5rem)] leading-[0.78] tracking-[-0.03em] select-none"
    >
      {text} klasjldkj
    </div>
  )
}
