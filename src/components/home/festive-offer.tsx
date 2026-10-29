"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ArrowRight, Copy } from "lucide-react"
import { gsap } from "@/lib/gsap"
import type { home } from "@/content/home"
import { offerHeadline, tickerLine, terms, type HomeOffer } from "@/lib/home-offer"
import { useScene } from "@/components/home/use-scene"

type Copy = typeof home.offer

/**
 * The festive offer band: a ticker that slides with the page, a huge percentage that rises out of a mask,
 * and a coupon that swings into place. The values are the real coupon's (see getHomeOffer); the wording around
 * them is in the content file.
 */
export function FestiveOffer({ offer, copy }: { offer: HomeOffer; copy: Copy }) {
  const ref = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  useScene(ref, ({ reduce }) => {
    const root = ref.current
    if (!root || reduce) return
    const span = { trigger: root, start: "top bottom", end: "bottom top", scrub: true }
    gsap.fromTo(
      root.querySelector("[data-ticker]"),
      { xPercent: 0 },
      { xPercent: -33, ease: "none", scrollTrigger: span }
    )
    gsap.fromTo(
      root.querySelector("[data-number]"),
      { yPercent: 70, opacity: 0 },
      {
        yPercent: 0,
        opacity: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: root, start: "top 85%", end: "top 35%", scrub: 0.6 },
      }
    )
    gsap.fromTo(
      root.querySelector("[data-ticket]"),
      { rotation: -14, x: 120, y: 60, opacity: 0 },
      {
        rotation: -2,
        x: 0,
        y: 0,
        opacity: 1,
        ease: "power2.out",
        scrollTrigger: { trigger: root, start: "top 80%", end: "center 55%", scrub: 0.6 },
      }
    )
  })

  const line = tickerLine(offer, copy.what)
  const headline = offerHeadline(offer)
  const copyCode = () => {
    try {
      void navigator.clipboard?.writeText(offer.code)
    } catch {
      /* the code is on the page to copy by hand */
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section
      ref={ref}
      aria-label="Festive offer"
      className="relative overflow-hidden bg-offer pb-[110px] text-offer-foreground"
    >
      <div
        aria-hidden="true"
        className="border-b border-offer-foreground/25 py-[18px] whitespace-nowrap"
      >
        <div data-ticker className="inline-block text-sm font-bold tracking-[0.22em] uppercase">
          {line.repeat(3)}
        </div>
      </div>
      <div className="home-container flex flex-wrap items-center justify-between gap-14 pt-24">
        <div className="min-w-0 flex-[1_1_460px]">
          <div className="text-xs font-bold tracking-[0.18em] text-[#f2cf86] uppercase">
            {copy.eyebrow}
          </div>
          <div className="mt-2.5 overflow-hidden">
            <div
              data-number
              className="font-display text-[clamp(6.5rem,17vw,15rem)] leading-[0.85] tracking-[-0.03em]"
            >
              {headline.big}
              <span className="text-[0.55em] italic">{headline.small}</span>
            </div>
          </div>
          <p className="mt-[22px] max-w-[30rem] text-lg leading-[1.55] text-offer-foreground/90">
            {copy.text}
          </p>
          <div className="mt-[30px]">
            <Link
              href={copy.cta.href}
              className="inline-flex h-[3.25rem] items-center gap-2.5 rounded-full bg-offer-foreground px-7 text-sm font-bold text-primary"
            >
              {copy.cta.label}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>

        <div
          data-ticket
          className="flex flex-[0_1_420px] rotate-[-2deg] rounded-md bg-offer-foreground text-primary shadow-[0_30px_60px_-24px_rgba(0,0,0,0.45)]"
        >
          <div className="min-w-0 flex-1 px-7 py-[30px]">
            <div className="text-[0.6875rem] font-bold tracking-[0.18em] text-offer uppercase">
              Your code
            </div>
            <div className="mt-2.5 font-display text-5xl leading-none tracking-[0.04em]">
              {offer.code}
            </div>
            <div className="mt-3.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
              {terms(offer)}
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="mt-5 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-primary px-5 text-[0.8125rem] font-bold hover:bg-primary hover:text-primary-foreground"
            >
              <Copy aria-hidden="true" className="size-[15px]" />
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
          <div
            aria-hidden="true"
            className="relative flex w-[74px] items-center justify-center border-l-2 border-dashed border-primary/30"
          >
            <span className="[transform:rotate(180deg)] font-display text-[1.375rem] tracking-[0.08em] text-offer [writing-mode:vertical-rl]">
              ambar · festive
            </span>
            <span className="absolute -top-3 -left-[13px] size-6 rounded-full bg-offer" />
            <span className="absolute -bottom-3 -left-[13px] size-6 rounded-full bg-offer" />
          </div>
        </div>
      </div>
    </section>
  )
}
