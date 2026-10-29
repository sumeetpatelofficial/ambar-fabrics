"use client"

import { useEffect, useRef, useState } from "react"
import { gsap } from "@/lib/gsap"
import type { home } from "@/content/home"
import { formatPaise } from "@/lib/money"
import { formatMetres, metresAt, priceForMetres } from "@/lib/cut-to-order"
import { Eyebrow } from "@/components/home/eyebrow"
import { useScene } from "@/components/home/use-scene"

type Copy = typeof home.cutToOrder

const START = 2.5 // what is shown before any scrolling, and with reduced motion
const END_CHAR = 12 // the strip starts at 1/12 of its length (0.25 m of 3 m)

/**
 * "Cut to order": scrolling unrolls a strip of fabric along a measuring tape from 0 to 3 metres. The big
 * length and price follow in quarter-metre steps. The numbers are drawn live (and hidden from screen
 * readers); a separate polite message is updated once scrolling settles, so it is not read out every step.
 */
export function CutToOrder({ copy }: { copy: Copy }) {
  const ref = useRef<HTMLElement>(null)
  const lenRef = useRef<HTMLDivElement>(null)
  const priceRef = useRef<HTMLElement>(null)
  const [spoken, setSpoken] = useState(
    `${formatMetres(START)}, ${formatPaise(priceForMetres(START, copy.ratePerMetrePaise))}`
  )
  const settle = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(settle.current), [])

  useScene(ref, ({ reduce }) => {
    const root = ref.current
    if (!root || reduce) return
    const strip = root.querySelector<HTMLElement>("[data-strip]")!
    const roll = root.querySelector<HTMLElement>("[data-roll]")!
    const range = { trigger: root, start: "top top+=64", end: "bottom bottom", scrub: 0.4 }

    gsap.set(roll, { left: 0 })
    gsap.fromTo(
      strip,
      { scaleX: 1 / END_CHAR },
      {
        scaleX: 1,
        ease: "none",
        scrollTrigger: {
          ...range,
          onUpdate: (self) => {
            const m = metresAt(self.progress)
            const text = formatMetres(m)
            const price = formatPaise(priceForMetres(m, copy.ratePerMetrePaise))
            if (lenRef.current) lenRef.current.textContent = text
            if (priceRef.current) priceRef.current.textContent = price
            window.clearTimeout(settle.current)
            settle.current = window.setTimeout(() => setSpoken(`${text}, ${price}`), 500)
          },
        },
      }
    )
    gsap.fromTo(
      roll,
      { x: () => strip.offsetWidth / END_CHAR },
      {
        x: () => strip.offsetWidth,
        ease: "none",
        scrollTrigger: { ...range, invalidateOnRefresh: true },
      }
    )
  })

  const startPrice = formatPaise(priceForMetres(START, copy.ratePerMetrePaise))
  const rate = formatPaise(copy.ratePerMetrePaise)

  return (
    <section ref={ref} aria-label={copy.eyebrow} className="metre-outer relative bg-secondary">
      <div className="stage flex items-center">
        <div className="home-container box-border w-full pt-10">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
            <div className="max-w-[35rem]">
              <Eyebrow>{copy.eyebrow}</Eyebrow>
              <h2 className="mt-4 text-[clamp(2.5rem,5vw,4.5rem)] leading-none">
                {copy.title} <em>{copy.titleEm}</em>
              </h2>
              <p className="mt-[18px] text-base leading-relaxed text-muted-foreground">
                {copy.text}
              </p>
            </div>
            <div className="text-right" aria-hidden="true">
              <div ref={lenRef} className="font-display text-[clamp(4rem,8vw,7rem)] leading-[0.9]">
                {formatMetres(START)}
              </div>
              <div className="mt-2.5 text-[0.9375rem] text-muted-foreground">
                <strong ref={priceRef} className="text-2xl text-foreground">
                  {startPrice}
                </strong>{" "}
                · {copy.product} at {rate} per metre
              </div>
            </div>
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {copy.product}: {spoken}
          </p>

          <div className="relative mt-[52px] h-[196px]" aria-hidden="true">
            <div
              data-strip
              className={`pat-${copy.pattern} absolute inset-x-0 top-2.5 h-[170px] origin-left shadow-[0_22px_30px_-20px_rgba(28,43,39,0.45)]`}
              style={{ transform: `scaleX(${START / 3})` }}
            />
            <div
              data-roll
              className="absolute top-0 -ml-5 h-[190px] w-10 rounded-[20px] shadow-[0_10px_20px_rgba(28,43,39,0.25)]"
              style={{
                left: `${(START / 3) * 100}%`,
                background: "linear-gradient(90deg, #7a2f28, #c98c82 45%, #7a2f28)",
              }}
            />
          </div>
          <div className="tape mt-3.5 h-4" aria-hidden="true" />
          <div
            className="mt-1.5 flex justify-between text-xs text-muted-foreground"
            aria-hidden="true"
          >
            <span>0 m</span>
            <span>1 m</span>
            <span>2 m</span>
            <span>3 m</span>
          </div>
        </div>
      </div>
    </section>
  )
}
