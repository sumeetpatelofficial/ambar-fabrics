"use client"

import Image from "next/image"
import Link from "next/link"
import { useRef } from "react"
import { gsap } from "@/lib/gsap"
import type { home } from "@/content/home"
import { Reveal } from "@/components/home/reveal"
import { useScene } from "@/components/home/use-scene"

type Copy = typeof home.lookbook

const SPEEDS: [number, number][] = [
  [6, -14],
  [-8, 10],
  [10, -24],
]
const PADS = ["0px", "120px", "48px"]

/**
 * A Pinterest-style lookbook: three columns of cards that move at different speeds as the page scrolls,
 * under a huge line of print names that slides sideways. With reduced motion everything stays still.
 */
export function LooksInMotion({ copy }: { copy: Copy }) {
  const ref = useRef<HTMLElement>(null)

  useScene(ref, ({ reduce, phone }) => {
    const root = ref.current
    if (!root || reduce) return
    const scrub = { trigger: root, start: "top bottom", end: "bottom top", scrub: true }
    root.querySelectorAll<HTMLElement>("[data-col]").forEach((col, i) => {
      const [from, to] = SPEEDS[i % 3]!
      const k = phone ? 0.5 : 1
      gsap.fromTo(
        col,
        { yPercent: from * k },
        { yPercent: to * k, ease: "none", scrollTrigger: scrub }
      )
    })
    gsap.fromTo(
      root.querySelector("[data-marquee]"),
      { xPercent: 0 },
      { xPercent: -38, ease: "none", scrollTrigger: scrub }
    )
    root.querySelectorAll<HTMLElement>("[data-card]").forEach((c) => {
      const fig = c.querySelector("[data-fig]")
      if (!fig) return
      gsap.fromTo(
        fig,
        { scale: 1.14, yPercent: 6 },
        {
          scale: 1,
          yPercent: 0,
          ease: "none",
          scrollTrigger: { trigger: c, start: "top bottom", end: "center 55%", scrub: true },
        }
      )
    })
  })

  return (
    <section
      ref={ref}
      aria-label="Lookbook"
      className="overflow-hidden bg-card pt-[120px] pb-[100px]"
    >
      <Reveal className="home-container flex flex-wrap items-end justify-between gap-6">
        <h2 className="text-[clamp(2.5rem,5vw,4.5rem)] leading-none">
          {copy.title} <em>{copy.titleEm}</em>
        </h2>
        <p className="max-w-[22.5rem] text-[0.9375rem] leading-relaxed text-muted-foreground">
          {copy.text}
        </p>
      </Reveal>

      <div aria-hidden="true" className="mt-11 mb-14 whitespace-nowrap">
        {/* The words are drawn from data-text by CSS (see home.css): a pale decoration, not content to read. */}
        <div data-marquee data-text={copy.marquee} className="marquee" />
      </div>

      <div className="home-container grid grid-cols-3 gap-7 max-[900px]:grid-cols-2 max-[900px]:gap-4">
        {copy.columns.map((col, ci) => (
          <div
            key={ci}
            data-col
            className={`flex flex-col gap-7 max-[900px]:gap-4 ${ci === 2 ? "max-[900px]:hidden" : ""}`}
            style={{ paddingTop: PADS[ci] }}
          >
            {col.map((k) => (
              <Link key={k.title} href={k.href} data-card className="block text-foreground">
                <div
                  className="relative aspect-[3/4] overflow-hidden rounded-[2px]"
                  style={{ background: k.bg }}
                >
                  <div data-fig className="absolute inset-0 origin-bottom">
                    {k.photo ? (
                      <Image
                        src={k.photo.src}
                        alt={k.photo.alt}
                        fill
                        sizes="(min-width: 901px) 30vw, 46vw"
                        className="object-cover object-[50%_15%]"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-[22%] bottom-0 h-[78%] rounded-t-[999px] bg-white/35"
                      />
                    )}
                  </div>
                </div>
                <div className="mt-3.5 flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{k.title}</span>
                  <span className="text-muted-foreground">{k.fabric}</span>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
